from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import httpx
from django.conf import settings
from django.utils import timezone

from agents.models import LLMRequestLog
from workouts.models import Exercise_DB, TechniqueReview

logger = logging.getLogger(__name__)
TECHNIQUE_ANALYSIS_FRAME_COUNT = 8
TECHNIQUE_CANDIDATE_FRAME_FPS = 3.0
TECHNIQUE_SIGNATURE_SIZE = 64
TECHNIQUE_ANALYSIS_FRAME_WIDTH = 960
TECHNIQUE_MIN_REP_SECONDS = 2.0
TECHNIQUE_MAX_REP_SECONDS = 8.0
TECHNIQUE_MIN_REP_VARIATION = 4.0
TECHNIQUE_MIN_REP_MOTION = 2.0


class TechniqueAnalysisError(Exception):
    def __init__(self, code: str, message: str | None = None):
        self.code = code
        super().__init__(message or code)


SUPPORTED_EXERCISE_QUERIES = [
    ("squat", ("присед", "squat")),
    ("push_up", ("отжим", "push-up", "push up")),
    (
        "pull_up",
        ("подтяг", "pull-up", "pull up", "pullup", "pullups", "chin-up", "chin up"),
    ),
    ("plank", ("планк", "plank")),
    ("lunge", ("выпад", "lunge")),
    ("dumbbell_press", ("жим гант", "dumbbell press", "shoulder press")),
    ("deadlift", ("станов", "deadlift")),
]


class TechniqueReviewAnalysisService:
    def __init__(self, review: TechniqueReview):
        self.review = review

    def analyze(self, *, forced_exercise: Exercise_DB | None = None) -> TechniqueReview:
        try:
            frames = self._extract_frames()
            if not frames:
                raise TechniqueAnalysisError(
                    "pose_estimation_failed", "Не удалось извлечь кадры из видео"
                )
            candidates = self._catalog_candidates()
            result = self._call_vision_llm(
                frames, candidates, forced_exercise=forced_exercise
            )
            self._apply_result(result, forced_exercise=forced_exercise)
        except TechniqueAnalysisError as exc:
            self._apply_failure(exc.code, str(exc), forced_exercise=forced_exercise)
        except Exception as exc:  # pragma: no cover - unexpected safety net
            logger.exception(
                "Technique analysis failed for review %s: %s", self.review.id, exc
            )
            self._apply_failure(
                "analysis_timeout",
                "Не удалось завершить анализ",
                forced_exercise=forced_exercise,
            )
        self.review.refresh_from_db()
        return self.review

    def _extract_frames(self) -> list[dict[str, str]]:
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            raise TechniqueAnalysisError(
                "pose_estimation_failed", "ffmpeg is not available"
            )

        timeout = max(
            int(getattr(settings, "TECHNIQUE_ANALYSIS_TIMEOUT_SECONDS", 45)), 5
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            input_path = (
                tmp_path / f"input{Path(self.review.video_file.name).suffix or '.mp4'}"
            )
            with self.review.video_file.open("rb") as source:
                input_path.write_bytes(source.read())

            duration = self._probe_video_duration(input_path, timeout=timeout)
            if duration:
                timestamps = self._select_analysis_timestamps(
                    ffmpeg_path=ffmpeg_path,
                    input_path=input_path,
                    duration=duration,
                    timeout=timeout,
                )
                self._extract_sampled_frames(
                    ffmpeg_path=ffmpeg_path,
                    input_path=input_path,
                    output_dir=tmp_path,
                    timestamps=timestamps,
                    timeout=timeout,
                )
            else:
                self._extract_initial_frames(
                    ffmpeg_path=ffmpeg_path,
                    input_path=input_path,
                    output_dir=tmp_path,
                    timeout=timeout,
                )

            frames: list[dict[str, Any]] = []
            for frame_path in sorted(tmp_path.glob("frame_*.jpg")):
                encoded = base64.b64encode(frame_path.read_bytes()).decode("ascii")
                frames.append(
                    {
                        "mime_type": "image/jpeg",
                        "data": encoded,
                        "timestamp_seconds": self._frame_timestamp_from_name(
                            frame_path
                        ),
                    }
                )
            return frames

    def _probe_video_duration(self, input_path: Path, *, timeout: int) -> float | None:
        ffprobe_path = shutil.which("ffprobe")
        if not ffprobe_path:
            return None
        try:
            completed = subprocess.run(
                [
                    ffprobe_path,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(input_path),
                ],
                check=False,
                capture_output=True,
                timeout=min(timeout, 10),
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        if completed.returncode != 0:
            return None
        try:
            duration = float(
                completed.stdout.decode("utf-8", errors="ignore").strip()
            )
        except ValueError:
            return None
        return duration if duration > 0 else None

    def _extract_sampled_frames(
        self,
        *,
        ffmpeg_path: str,
        input_path: Path,
        output_dir: Path,
        timestamps: list[float],
        timeout: int,
    ) -> None:
        for index, timestamp in enumerate(timestamps):
            output_path = output_dir / f"frame_{index:02d}_{timestamp:.3f}.jpg"
            completed = subprocess.run(
                [
                    ffmpeg_path,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{timestamp:.3f}",
                    "-i",
                    str(input_path),
                    "-frames:v",
                    "1",
                    "-vf",
                    f"scale='min({TECHNIQUE_ANALYSIS_FRAME_WIDTH},iw)':-2",
                    str(output_path),
                ],
                check=False,
                capture_output=True,
                timeout=timeout,
            )
            if completed.returncode == 0 and output_path.exists():
                continue
            logger.warning(
                "ffmpeg technique sampled frame extraction failed review_id=%s timestamp=%s stderr=%s",
                self.review.id,
                timestamp,
                completed.stderr.decode("utf-8", errors="ignore")[:500],
            )

        if not any(output_dir.glob("frame_*.jpg")):
            raise TechniqueAnalysisError("pose_estimation_failed", "ffmpeg failed")

    def _select_analysis_timestamps(
        self,
        *,
        ffmpeg_path: str,
        input_path: Path,
        duration: float,
        timeout: int,
    ) -> list[float]:
        target_count = TECHNIQUE_ANALYSIS_FRAME_COUNT
        candidates = self._extract_motion_candidates(
            ffmpeg_path=ffmpeg_path,
            input_path=input_path,
            duration=duration,
            timeout=timeout,
        )
        repeated_window = self._find_repeated_motion_window(candidates)
        if not repeated_window:
            raise TechniqueAnalysisError(
                "insufficient_repetitions",
                "Не удалось найти два похожих повторяющихся движения",
            )
        start_index, cycle_length = repeated_window
        return self._timestamps_for_repeated_window(
            candidates,
            start_index=start_index,
            cycle_length=cycle_length,
            target_count=target_count,
            duration=duration,
        )

    def _extract_motion_candidates(
        self,
        *,
        ffmpeg_path: str,
        input_path: Path,
        duration: float,
        timeout: int,
    ) -> list[tuple[float, bytes]]:
        size = TECHNIQUE_SIGNATURE_SIZE
        frame_size = size * size
        try:
            completed = subprocess.run(
                [
                    ffmpeg_path,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(input_path),
                    "-vf",
                    f"fps={TECHNIQUE_CANDIDATE_FRAME_FPS},scale={size}:{size},format=gray",
                    "-f",
                    "rawvideo",
                    "pipe:1",
                ],
                check=False,
                capture_output=True,
                timeout=timeout,
            )
        except (OSError, subprocess.TimeoutExpired):
            return []
        if completed.returncode != 0 or not completed.stdout:
            return []

        frame_count = len(completed.stdout) // frame_size
        candidates: list[tuple[float, bytes]] = []
        for index in range(frame_count):
            start = index * frame_size
            timestamp = min(
                index / TECHNIQUE_CANDIDATE_FRAME_FPS,
                max(duration - 0.1, 0.0),
            )
            candidates.append(
                (timestamp, completed.stdout[start : start + frame_size])
            )
        return candidates

    def _find_repeated_motion_window(
        self,
        candidates: list[tuple[float, bytes]],
    ) -> tuple[int, int] | None:
        if len(candidates) < 2:
            return None

        fps = TECHNIQUE_CANDIDATE_FRAME_FPS
        min_cycle_length = max(int(round(TECHNIQUE_MIN_REP_SECONDS * fps)), 2)
        max_cycle_length = min(
            int(round(TECHNIQUE_MAX_REP_SECONDS * fps)),
            len(candidates) // 2,
        )
        if max_cycle_length < min_cycle_length:
            return None

        motion_scores: list[float] = []
        for index in range(1, len(candidates)):
            motion_scores.append(
                self._frame_distance(candidates[index - 1][1], candidates[index][1])
            )

        best_window: tuple[int, int] | None = None
        best_score = -1.0
        for cycle_length in range(min_cycle_length, max_cycle_length + 1):
            for start_index in range(0, len(candidates) - cycle_length * 2 + 1):
                first_cycle = candidates[start_index : start_index + cycle_length]
                second_cycle = candidates[
                    start_index + cycle_length : start_index + cycle_length * 2
                ]
                first_variation = self._cycle_variation(first_cycle)
                second_variation = self._cycle_variation(second_cycle)
                variation = min(first_variation, second_variation)
                if variation < TECHNIQUE_MIN_REP_VARIATION:
                    continue

                first_motion = self._cycle_motion(
                    motion_scores,
                    start_index=start_index,
                    cycle_length=cycle_length,
                )
                second_motion = self._cycle_motion(
                    motion_scores,
                    start_index=start_index + cycle_length,
                    cycle_length=cycle_length,
                )
                if (
                    min(first_motion, second_motion)
                    < TECHNIQUE_MIN_REP_MOTION
                ):
                    continue

                phase_distance = self._cycle_phase_distance(
                    first_cycle, second_cycle
                )
                if phase_distance > variation * 0.85:
                    continue

                score = (
                    variation * 1.4
                    + min(first_motion, second_motion) * 0.8
                    - phase_distance
                    - cycle_length * 0.03
                )
                if score > best_score:
                    best_score = score
                    best_window = (start_index, cycle_length)

        return best_window

    @classmethod
    def _cycle_variation(cls, cycle: list[tuple[float, bytes]]) -> float:
        if len(cycle) < 2:
            return 0.0
        first_signature = cycle[0][1]
        return max(
            cls._frame_distance(first_signature, signature)
            for _, signature in cycle[1:]
        )

    @staticmethod
    def _cycle_motion(
        motion_scores: list[float],
        *,
        start_index: int,
        cycle_length: int,
    ) -> float:
        start = start_index
        end = max(start_index + cycle_length - 1, start)
        values = motion_scores[start:end]
        if not values:
            return 0.0
        return sum(values) / len(values)

    @classmethod
    def _cycle_phase_distance(
        cls,
        first_cycle: list[tuple[float, bytes]],
        second_cycle: list[tuple[float, bytes]],
    ) -> float:
        count = min(len(first_cycle), len(second_cycle))
        if count == 0:
            return 0.0
        return sum(
            cls._frame_distance(first_cycle[index][1], second_cycle[index][1])
            for index in range(count)
        ) / count

    @staticmethod
    def _timestamps_for_repeated_window(
        candidates: list[tuple[float, bytes]],
        *,
        start_index: int,
        cycle_length: int,
        target_count: int,
        duration: float,
    ) -> list[float]:
        first_cycle_count = target_count // 2
        second_cycle_count = target_count - first_cycle_count
        cycle_seconds = cycle_length / TECHNIQUE_CANDIDATE_FRAME_FPS
        first_cycle_start = candidates[start_index][0]
        second_cycle_start = candidates[start_index + cycle_length][0]
        last_safe_timestamp = max(duration - 0.1, 0.0)
        timestamps = [
            min(first_cycle_start + cycle_seconds * position, last_safe_timestamp)
            for position in TechniqueReviewAnalysisService._phase_positions(
                first_cycle_count
            )
        ]
        timestamps.extend(
            min(second_cycle_start + cycle_seconds * position, last_safe_timestamp)
            for position in TechniqueReviewAnalysisService._phase_positions(
                second_cycle_count
            )
        )
        return timestamps

    @staticmethod
    def _phase_positions(count: int) -> list[float]:
        if count <= 1:
            return [0.5]
        step = 0.8 / (count - 1)
        return [0.1 + index * step for index in range(count)]

    @staticmethod
    def _frame_distance(left: bytes, right: bytes) -> float:
        if not left or not right:
            return 0.0
        size = min(len(left), len(right))
        if size <= 0:
            return 0.0
        return sum(abs(left[index] - right[index]) for index in range(size)) / size

    def _extract_initial_frames(
        self,
        *,
        ffmpeg_path: str,
        input_path: Path,
        output_dir: Path,
        timeout: int,
    ) -> None:
        output_pattern = str(output_dir / "frame_%02d.jpg")
        completed = subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(input_path),
                "-vf",
                f"fps=1,scale='min({TECHNIQUE_ANALYSIS_FRAME_WIDTH},iw)':-2",
                "-frames:v",
                "4",
                output_pattern,
            ],
            check=False,
            capture_output=True,
            timeout=timeout,
        )
        if completed.returncode != 0:
            logger.warning(
                "ffmpeg technique frame extraction failed review_id=%s stderr=%s",
                self.review.id,
                completed.stderr.decode("utf-8", errors="ignore")[:500],
            )
            raise TechniqueAnalysisError("pose_estimation_failed", "ffmpeg failed")

    @staticmethod
    def _frame_timestamp_from_name(frame_path: Path) -> float | None:
        parts = frame_path.stem.split("_")
        if len(parts) < 3:
            return None
        try:
            return float(parts[-1])
        except ValueError:
            return None

    def _catalog_candidates(self) -> list[dict[str, Any]]:
        filters = None
        for _, aliases in SUPPORTED_EXERCISE_QUERIES:
            for alias in aliases:
                query = Exercise_DB.objects.filter(
                    name_ru__icontains=alias
                ) | Exercise_DB.objects.filter(name_en__icontains=alias)
                filters = query if filters is None else filters | query
        qs = (
            (filters or Exercise_DB.objects.none())
            .distinct()
            .order_by("name_ru", "name_en")[:80]
        )
        return [
            {
                "id": exercise.id,
                "name": exercise.name,
                "name_en": exercise.name_en,
                "name_ru": exercise.name_ru,
                "equipment": exercise.equipment_ru or exercise.equipment_en,
            }
            for exercise in qs
        ]

    def _call_vision_llm(
        self,
        frames: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        *,
        forced_exercise: Exercise_DB | None,
    ) -> dict[str, Any]:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise TechniqueAnalysisError(
                "llm_unavailable", "OpenRouter API key is missing"
            )

        model = os.environ.get("OPENROUTER_VISION_MODEL") or os.environ.get(
            "OPENROUTER_MODEL", "openai/gpt-4o-mini"
        )
        base_url = os.environ.get(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        ).rstrip("/")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        referrer = os.environ.get("OPENROUTER_REFERRER")
        if referrer:
            headers["HTTP-Referer"] = referrer
        headers["X-Title"] = os.environ.get("OPENROUTER_APP_NAME", "fitTODOay")

        selected_timestamps = [
            frame.get("timestamp_seconds")
            for frame in frames
            if frame.get("timestamp_seconds") is not None
        ]
        user_payload = {
            "catalog_candidates": candidates,
            "forced_exercise": (
                {
                    "id": forced_exercise.id,
                    "name": forced_exercise.name,
                    "name_en": forced_exercise.name_en,
                    "name_ru": forced_exercise.name_ru,
                }
                if forced_exercise
                else None
            ),
            "instructions": (
                "Определи упражнение по кадрам и оцени технику. Используй только catalog_candidates. "
                "Кадры выбраны backend после поиска двух похожих циклических повторов; timestamps показывают "
                "фазы этих повторов в исходном видео. Если forced_exercise передан, анализируй именно его. "
                "Верни только JSON."
            ),
            "selected_frame_timestamps_seconds": selected_timestamps,
        }
        content: list[dict[str, Any]] = [
            {"type": "text", "text": json.dumps(user_payload, ensure_ascii=False)}
        ]
        for frame in frames:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{frame['mime_type']};base64,{frame['data']}",
                    },
                }
            )

        system_prompt = (
            "Ты фитнес-тренер и video-analysis ассистент. Отвечай строго валидным JSON без Markdown. "
            "Не ставь медицинские диагнозы. Если качество видео недостаточно для уверенного вывода, явно укажи это. "
            "Схема: {"
            '"detected_exercise":{"name":string,"catalog_exercise_id":string|null,"confidence":number,'
            '"alternatives":[{"name":string,"catalog_exercise_id":string|null,"confidence":number}]},'
            '"score":number|null,"summary":string,"issues":[{"code":string,"severity":"low|medium|high",'
            '"title":string,"evidence":string,"advice":string}],"positive_notes":[string],'
            '"next_set_focus":[string],"camera_feedback":[string]}'
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ]
        payload = {
            "model": model,
            "response_format": {"type": "json_object"},
            "messages": messages,
        }
        log_payload = {
            **payload,
            "image_count": len(frames),
            "selected_frame_timestamps_seconds": selected_timestamps,
        }
        timeout = httpx.Timeout(
            connect=10.0,
            read=float(
                max(
                    int(getattr(settings, "TECHNIQUE_ANALYSIS_TIMEOUT_SECONDS", 45)), 15
                )
            ),
            write=20.0,
            pool=None,
        )
        raw_text = ""
        try:
            response = httpx.post(
                f"{base_url}/chat/completions",
                json=payload,
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            data = response.json()
            raw_text = data["choices"][0]["message"]["content"]
            parsed = json.loads(raw_text.strip())
            self._log_llm(
                payload=log_payload, response=parsed, success=True, status="technique_ok"
            )
            return parsed
        except httpx.TimeoutException as exc:
            self._log_llm(
                payload=log_payload,
                response=None,
                success=False,
                status="analysis_timeout",
                error=str(exc),
            )
            raise TechniqueAnalysisError(
                "analysis_timeout", "OpenRouter timeout"
            ) from exc
        except httpx.HTTPStatusError as exc:
            response_text = exc.response.text[:1000] if exc.response is not None else ""
            error_message = (
                f"{exc}; response={response_text}" if response_text else str(exc)
            )
            self._log_llm(
                payload=log_payload,
                response=None,
                success=False,
                status="llm_unavailable",
                error=error_message,
            )
            raise TechniqueAnalysisError(
                "llm_unavailable", "OpenRouter request failed"
            ) from exc
        except httpx.HTTPError as exc:
            self._log_llm(
                payload=log_payload,
                response=None,
                success=False,
                status="llm_unavailable",
                error=str(exc),
            )
            raise TechniqueAnalysisError(
                "llm_unavailable", "OpenRouter request failed"
            ) from exc
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            self._log_llm(
                payload=log_payload,
                response={"raw": raw_text} if raw_text else None,
                success=False,
                status="invalid_llm_response",
                error=str(exc),
            )
            raise TechniqueAnalysisError(
                "invalid_llm_response", "Invalid LLM response"
            ) from exc

    def _apply_result(
        self, result: dict[str, Any], *, forced_exercise: Exercise_DB | None
    ) -> None:
        detected = result.get("detected_exercise") if isinstance(result, dict) else {}
        if not isinstance(detected, dict):
            raise TechniqueAnalysisError(
                "invalid_llm_response", "detected_exercise missing"
            )

        exercise = forced_exercise or self._resolve_catalog_exercise(
            detected.get("catalog_exercise_id")
        )
        confidence = self._safe_float(detected.get("confidence"))
        alternatives = (
            detected.get("alternatives")
            if isinstance(detected.get("alternatives"), list)
            else []
        )

        self.review.detected_exercise_name = str(
            detected.get("name") or (exercise.name if exercise else "")
        )
        self.review.detected_exercise_confidence = confidence
        self.review.result_json = self._normalize_result_json(result)
        self.review.summary = str(result.get("summary") or "")
        self.review.score = self._normalize_score(result.get("score"))
        self.review.error_code = ""

        if exercise and (forced_exercise or confidence is None or confidence >= 0.75):
            self.review.exercise = exercise
            self.review.status = TechniqueReview.Status.COMPLETED
        elif exercise and confidence is not None and confidence >= 0.45:
            self.review.exercise = exercise
            self.review.status = TechniqueReview.Status.NEEDS_CONFIRMATION
        elif alternatives:
            self.review.status = TechniqueReview.Status.NEEDS_CONFIRMATION
            self.review.error_code = "low_confidence"
        else:
            self.review.status = TechniqueReview.Status.FAILED
            self.review.error_code = "exercise_not_detected"

        self.review.save(
            update_fields=[
                "exercise",
                "detected_exercise_name",
                "detected_exercise_confidence",
                "status",
                "score",
                "result_json",
                "summary",
                "error_code",
                "updated_at",
            ]
        )

    def _apply_failure(
        self,
        error_code: str,
        message: str,
        *,
        forced_exercise: Exercise_DB | None,
    ) -> None:
        detected = self._filename_detection_hint()
        if error_code == "insufficient_repetitions":
            if forced_exercise:
                self.review.exercise = forced_exercise
                self.review.detected_exercise_name = forced_exercise.name
                self.review.detected_exercise_confidence = 1.0
            self.review.status = TechniqueReview.Status.FAILED
            self.review.error_code = error_code
            self.review.summary = (
                "Не удалось найти два повторяющихся движения. Снимите 2-3 полных повтора упражнения."
            )
        elif forced_exercise:
            self.review.exercise = forced_exercise
            self.review.detected_exercise_name = forced_exercise.name
            self.review.detected_exercise_confidence = 1.0
            self.review.status = TechniqueReview.Status.FAILED
            self.review.error_code = error_code
            self.review.summary = (
                "Видео сохранено, но автоматический анализ техники сейчас недоступен."
            )
        elif detected:
            exercise, confidence = detected
            self.review.exercise = exercise
            self.review.detected_exercise_name = exercise.name
            self.review.detected_exercise_confidence = confidence
            self.review.status = TechniqueReview.Status.NEEDS_CONFIRMATION
            self.review.error_code = "low_confidence"
            self.review.summary = "Видео сохранено. Подтвердите упражнение, чтобы продолжить разбор техники."
        else:
            self.review.status = TechniqueReview.Status.FAILED
            self.review.error_code = error_code
            self.review.summary = "Не удалось разобрать видео. Попробуйте снять упражнение сбоку, чтобы все тело было видно в кадре."
        self.review.result_json = {
            "error": {"code": self.review.error_code, "message": message},
            "detected_exercise": {
                "name": self.review.detected_exercise_name,
                "catalog_exercise_id": self.review.exercise_id,
                "confidence": self.review.detected_exercise_confidence,
                "alternatives": self._fallback_alternatives(),
            },
        }
        self.review.save(
            update_fields=[
                "exercise",
                "detected_exercise_name",
                "detected_exercise_confidence",
                "status",
                "result_json",
                "summary",
                "error_code",
                "updated_at",
            ]
        )

    def _filename_detection_hint(self) -> tuple[Exercise_DB, float] | None:
        name = Path(self.review.video_file.name).stem.lower()
        for _, aliases in SUPPORTED_EXERCISE_QUERIES:
            if any(alias.lower() in name for alias in aliases):
                for alias in aliases:
                    exercise = (
                        Exercise_DB.objects.filter(name_ru__icontains=alias).first()
                        or Exercise_DB.objects.filter(name_en__icontains=alias).first()
                    )
                    if exercise:
                        return exercise, 0.55
        return None

    def _fallback_alternatives(self) -> list[dict[str, Any]]:
        alternatives = []
        for exercise in Exercise_DB.objects.order_by("name_ru", "name_en")[:6]:
            alternatives.append(
                {
                    "name": exercise.name,
                    "catalog_exercise_id": exercise.id,
                    "confidence": None,
                }
            )
        return alternatives

    def _resolve_catalog_exercise(self, raw_id: Any) -> Exercise_DB | None:
        if raw_id in (None, ""):
            return None
        return Exercise_DB.objects.filter(id=str(raw_id)).first()

    def _normalize_result_json(self, result: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(result)
        detected = normalized.get("detected_exercise")
        if isinstance(detected, dict):
            raw_id = detected.get("catalog_exercise_id")
            detected["catalog_exercise_id"] = (
                str(raw_id) if raw_id not in (None, "") else None
            )
        return normalized

    def _normalize_score(self, raw_score: Any) -> int | None:
        if raw_score in (None, ""):
            return None
        try:
            score = int(round(float(raw_score)))
        except (TypeError, ValueError):
            return None
        return min(max(score, 0), 100)

    def _safe_float(self, value: Any) -> float | None:
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _log_llm(
        self, *, payload, response, success: bool, status: str, error: str | None = None
    ):
        sanitized_payload = self._sanitize_payload(payload)
        try:
            LLMRequestLog.objects.create(
                user=self.review.user,
                payload=sanitized_payload,
                response=response,
                status=status,
                success=success,
                error_message=error or "",
                created_at=timezone.now(),
            )
        except Exception:  # pragma: no cover
            logger.exception("Failed to log technique LLM request")

    def _sanitize_payload(self, payload):
        def sanitize(value):
            if isinstance(value, dict):
                if "image_url" in value:
                    return {"type": "image_url", "image_url": {"url": "[base64-image]"}}
                return {key: sanitize(inner) for key, inner in value.items()}
            if isinstance(value, list):
                return [sanitize(item) for item in value]
            return value

        return sanitize(payload)


def guess_content_type(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"
