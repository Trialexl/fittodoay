"""Add reproducible annual history to the dedicated cross-client QA account only.

Uses the existing public API contract, preserves all existing logs and weigh-ins,
never changes an existing program, and is resumable by reading each day's records.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import hashlib
import json
import math
import os
from pathlib import Path
import urllib.error
import urllib.request

SERVER = 'https://trialexl4.freemyip.com'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials', type=Path, default=Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local/share')) / 'fitTODOay/cross-client-qa.json')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expanded', action='store_true', help='Add three clearly marked QA programs with 18 catalog exercises')
    parser.add_argument('--report-only', action='store_true', help='Read actual annual counts without adding records')
    args = parser.parse_args()
    credentials = json.loads(args.credentials.read_text(encoding='utf-8-sig'))
    email = credentials['email'].strip()
    if not (email.startswith('android-cross-') and email.endswith('@example.invalid')):
        raise SystemExit('Refusing: only the dedicated android-cross-* QA account is allowed')
    token = ''

    def api(path, method='GET', body=None):
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
        if token:
            headers['Authorization'] = 'Token ' + token
        payload = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(SERVER + path, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'QA API {method} {path.split("?")[0]} failed: HTTP {error.code}; credentials omitted') from None

    token = api('/api/auth/login/', 'POST', {'email': email, 'password': credentials['password']})['token']
    def rows(value):
        return value if isinstance(value, list) else value.get('results', value.get('items', []))

    if args.report_only:
        period = f'start={date.today() - timedelta(days=364)}&end={date.today()}'
        days = rows(api('/api/analytics/days/?' + period))
        weights = rows(api('/api/analytics/body-weight/?' + period))
        exercises = rows(api('/api/analytics/exercises/?' + period))
        summary = {'source': 'actual-qa-server-records', 'period': period, 'qa_account': hashlib.sha256(email.encode()).hexdigest()[:12], 'workout_days': sum(float(day.get('load') or 0) > 0 for day in days), 'weigh_ins': sum(row.get('weight_kg') is not None for row in weights), 'exercise_count': len(exercises), 'set_count': sum(row.get('sets', 0) for row in exercises)}
        output = Path(__file__).resolve().parent.parent / 'artifacts/analytics-fixture-totals.json'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(summary), flush=True)
        return

    if args.expanded and args.apply:
        folders = rows(api('/api/programs/folders/'))
        catalog = rows(api('/api/exercises/?limit=18'))
        assert len(catalog) >= 18, 'Need 18 real catalog entries for expanded QA fixtures'
        existing_templates = rows(api('/api/programs/templates/'))
        for group in range(3):
            name = f'QA графики · Программа {group + 1}'
            folder = next((f for f in folders if f['name'] == name), None)
            if folder is not None and not folder.get('comment', '').startswith('Synthetic annual Android chart fixture'):
                raise SystemExit('Refusing: a program with the fixture name has another purpose')
            if folder is None:
                folder = api('/api/programs/folders/', 'POST', {'name': name, 'comment': 'Synthetic annual Android chart fixture; not personal training advice', 'is_active': True})
                folders.append(folder)
            for part in range(2):
                title = f'QA день {part + 1}'
                template = next((t for t in existing_templates if t['folder'] == folder['id'] and t['name'] == title), None)
                if template is None:
                    template = api('/api/programs/templates/', 'POST', {'folder': folder['id'], 'name': title, 'schedule_type': 'weekly', 'schedule_config': {'days_of_week': [group + part * 3]}})
                    existing_templates.append(template)
                current = api(f'/api/programs/templates/{template["id"]}/')
                present = {str((e.get('exercise') or {}).get('id')) for e in current.get('template_exercises', [])}
                for exercise in catalog[group * 6 + part * 3:group * 6 + part * 3 + 3]:
                    if str(exercise['id']) not in present:
                        api('/api/programs/template-exercises/', 'POST', {'template': template['id'], 'exercise_id': exercise['id'], 'set_override': 3, 'rep_override': 10, 'weight_override': 15 if exercise.get('has_weight') else None, 'time_override': 30 if exercise.get('has_time') else None, 'rest_override': 60, 'is_active': True})
                        present.add(str(exercise['id']))
        print(json.dumps({'expanded_qa_fixture': True, 'additional_programs': 3, 'additional_days': 6, 'catalog_exercises': 18}), flush=True)
    templates = api('/api/programs/templates/')
    if isinstance(templates, dict):
        templates = templates.get('results', templates.get('items', []))
    if not any(t.get('template_exercises') for t in templates):
        raise SystemExit('QA account has no exercise templates; no program will be created implicitly')
    end = date.today() - timedelta(days=1)
    start = date.today() - timedelta(days=364)
    identity = hashlib.sha256(email.encode()).hexdigest()[:12]
    print(json.dumps({'mode': 'apply' if args.apply else 'dry-run', 'qa_account': identity, 'start': str(start), 'end': str(end), 'preserve_existing': True, 'existing_programs_unchanged': True, 'expanded': args.expanded}), flush=True)
    if not args.apply:
        return

    def seed_day(offset):
        target = start + timedelta(days=offset)
        day = api('/api/workouts/plan/?date=' + str(target))
        folders = day.get('plan_snapshot', {}).get('folders', day.get('folders', []))
        logs = {(log['template_exercise'], log['set_index']) for log in day.get('set_logs', day.get('logs', []))}
        created = 0
        # Some weeks deliberately contain a break, others a deload. Values are
        # synthetic fixtures for rendering, never personal training advice.
        if offset % 2 == 0 and offset // 7 % 13 != 8:
            for folder in folders:
                for template in folder.get('templates', []):
                    for exercise in template.get('exercises', []):
                        if not exercise.get('is_active', True):
                            continue
                        source = exercise.get('source') or {}
                        defaults = exercise.get('defaults') or {}
                        for planned in exercise.get('sets', [])[:2]:
                            key = (exercise['template_exercise_id'], planned['set_index'])
                            if key in logs:
                                continue
                            progress = offset / 364
                            deload = .8 if offset // 7 % 6 == 5 else 1
                            payload = {'workout_day': day['id'], 'template_exercise': key[0], 'set_index': key[1]}
                            if source.get('has_time'):
                                payload['actual_time'] = max(10, round((defaults.get('time') or 30) * (1 + .2 * progress) * deload))
                            else:
                                payload['actual_reps'] = max(1, round((defaults.get('reps') or 10) * deload + offset % 3 - 1))
                                if source.get('has_weight'):
                                    baseline = float(defaults.get('weight') or 12)
                                    payload['actual_weight'] = round((baseline + 7.5 * progress) * deload * 2) / 2
                            # Never automatically retry POST after an ambiguous response.
                            api('/api/workouts/logs/', 'POST', payload)
                            logs.add(key)
                            created += 1
        weighed = False
        if offset % 3 == 0 and (day.get('weigh_in') or {}).get('weight_kg') is None:
            weight = round(83 - 4.5 * offset / 364 + .7 * math.sin(offset / 19) + .3 * math.sin(offset / 4), 2)
            api('/api/workouts/weigh-in/', 'PUT', {'date': str(target), 'weight_kg': str(weight), 'note': 'Synthetic Android analytics QA fixture'})
            weighed = True
        # Verify the public read contract, including successfully recorded values.
        if created or weighed:
            check = api('/api/workouts/plan/?date=' + str(target))
            actual = {(log['template_exercise'], log['set_index']) for log in check.get('set_logs', check.get('logs', []))}
            assert logs <= actual, 'Created records absent from the reread plan'
            if weighed:
                assert float(check['weigh_in']['weight_kg']) == weight
        return created, int(weighed)

    totals = [0, 0]
    # Two independent dates at a time, never concurrent writes to the same day.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for completed, result in enumerate(pool.map(seed_day, range((end - start).days + 1)), 1):
            totals[0] += result[0]
            totals[1] += result[1]
            if completed % 28 == 0:
                print(json.dumps({'days_checked': completed, 'new_sets': totals[0], 'new_weigh_ins': totals[1]}), flush=True)
    summary = {'qa_account': identity, 'start': str(start), 'end': str(end), 'days_checked': (end - start).days + 1, 'new_sets': totals[0], 'new_weigh_ins': totals[1], 'verified_by_reread': True, 'existing_programs_unchanged': True, 'expanded': args.expanded}
    output = Path(__file__).resolve().parent.parent / 'artifacts/analytics-fixture.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
