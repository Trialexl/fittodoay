from rest_framework.routers import DefaultRouter

from .views import DayTemplateViewSet, ProgramFolderViewSet, TemplateExerciseViewSet

router = DefaultRouter()
router.register(r"folders", ProgramFolderViewSet, basename="program-folder")
router.register(r"templates", DayTemplateViewSet, basename="day-template")
router.register(
    r"template-exercises", TemplateExerciseViewSet, basename="template-exercise"
)

urlpatterns = router.urls
