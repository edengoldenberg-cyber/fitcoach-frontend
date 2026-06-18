/**
 * pages.config.js - Page routing configuration
 */
import AutomationSettings from './pages/AutomationSettings';
import BetaMonitoring from './pages/BetaMonitoring';
import AccessCodeLogin from './pages/AccessCodeLogin';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import WhatsAppHealthDashboard from './pages/WhatsAppHealthDashboard';
import AccessLink from './pages/AccessLink';
import Achievements from './pages/Achievements';
import Activity from './pages/Activity';
import AddTrainee from './pages/AddTrainee';
import AdminPurgeEmail from './pages/AdminPurgeEmail';
import AuditReport from './pages/AuditReport';
import BarcodeScan from './pages/BarcodeScan';
import BodyMeasurements from './pages/BodyMeasurements';
import Chat from './pages/Chat';
import CoachAutomations from './pages/CoachAutomations';
import CoachDailyAlert from './pages/CoachDailyAlert';
import CoachDailyWorkout from './pages/CoachDailyWorkout';
import CoachDashboard from './pages/CoachDashboard';
import CoachExternalMembers from './pages/CoachExternalMembers';
import CoachGroupWorkouts from './pages/CoachGroupWorkouts';
import CoachInsights from './pages/CoachInsights';
import CoachNutrition from './pages/CoachNutrition';
import CoachRecommendedFoods from './pages/CoachRecommendedFoods';
import CoachReports from './pages/CoachReports';
import CoachSettings from './pages/CoachSettings';
import CoachWorkouts from './pages/CoachWorkouts';
import CopyLogs from './pages/CopyLogs';
import CreateDailyPersonal from './pages/CreateDailyPersonal';
import CreateProgram from './pages/CreateProgram';
import CreateRotationProgram from './pages/CreateRotationProgram';
import DebugCrashes from './pages/DebugCrashes';
import DebugPage from './pages/DebugPage';
import DeviceConnect from './pages/DeviceConnect';
import DeviceStats from './pages/DeviceStats';
import FoodDatabase from './pages/FoodDatabase';
import FoodImport from './pages/FoodImport';
import GoogleAuthSetup from './pages/GoogleAuthSetup';
import Home from './pages/Home';
import MagicLogin from './pages/MagicLogin';
import ManageModules from './pages/ManageModules';
import ManageTrainees from './pages/ManageTrainees';
import MessagingCenter from './pages/MessagingCenter';
import Metrics from './pages/Metrics';
import MyFavorites from './pages/MyFavorites';
import NotificationCenter from './pages/NotificationCenter';
import NutritionLog from './pages/NutritionLog';
import OnlineTraining from './pages/OnlineTraining';
import OnlineTrainingCoach from './pages/OnlineTrainingCoach';
import OnlineTrainingCoachV2 from './pages/OnlineTrainingCoachV2';
import PendingApproval from './pages/PendingApproval';
import PendingFoods from './pages/PendingFoods';
import PerformOnlineWorkout from './pages/PerformOnlineWorkout';
import SendDailyPersonal from './pages/SendDailyPersonal';
import SetPassword from './pages/SetPassword';
import LoginWithPassword from './pages/LoginWithPassword';
import SuggestFavoritesManager from './pages/SuggestFavoritesManager';
import SyncUsers from './pages/SyncUsers';
import SystemAuditLogs from './pages/SystemAuditLogs';
import SystemCare from './pages/SystemCare';
import SystemNotificationsManager from './pages/SystemNotificationsManager';
import SystemTest from './pages/SystemTest';
import TemplateManager from './pages/TemplateManager';
import TraineeCard360 from './pages/TraineeCard360';
import TraineeDailyWorkout from './pages/TraineeDailyWorkout';
import TraineeGroupWorkouts from './pages/TraineeGroupWorkouts';
import TraineeHome from './pages/TraineeHome';
import TraineeManagement from './pages/TraineeManagement';
import TraineeNotifications from './pages/TraineeNotifications';
import TraineeOnlineTraining from './pages/TraineeOnlineTraining';
import TraineeOnlineWorkouts from './pages/TraineeOnlineWorkouts';
import TraineeProfile from './pages/TraineeProfile';
import TraineeQA from './pages/TraineeQA';
import UnitsDebug from './pages/UnitsDebug';
import WaterLog from './pages/WaterLog';
import WhatsAppManager from './pages/WhatsAppManager';
import WorkoutDetails from './pages/WorkoutDetails';
import WorkoutLog from './pages/WorkoutLog';
import WorkoutSession from './pages/WorkoutSession';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AutomationSettings": AutomationSettings,
    "BetaMonitoring": BetaMonitoring,
    "AccessCodeLogin": AccessCodeLogin,
    "ExecutiveDashboard": ExecutiveDashboard,
    "WhatsAppHealthDashboard": WhatsAppHealthDashboard,
    "AccessLink": AccessLink,
    "Achievements": Achievements,
    "Activity": Activity,
    "AddTrainee": AddTrainee,
    "AdminPurgeEmail": AdminPurgeEmail,
    "AuditReport": AuditReport,
    "BarcodeScan": BarcodeScan,
    "BodyMeasurements": BodyMeasurements,
    "Chat": Chat,
    "CoachAutomations": CoachAutomations,
    "CoachDailyAlert": CoachDailyAlert,
    "CoachDailyWorkout": CoachDailyWorkout,
    "CoachDashboard": CoachDashboard,
    "CoachExternalMembers": CoachExternalMembers,
    "CoachGroupWorkouts": CoachGroupWorkouts,
    "CoachInsights": CoachInsights,
    "CoachNutrition": CoachNutrition,
    "CoachRecommendedFoods": CoachRecommendedFoods,
    "CoachReports": CoachReports,
    "CoachSettings": CoachSettings,
    "CoachWorkouts": CoachWorkouts,
    "CopyLogs": CopyLogs,
    "CreateDailyPersonal": CreateDailyPersonal,
    "CreateProgram": CreateProgram,
    "CreateRotationProgram": CreateRotationProgram,
    // DebugCrashes and DebugPage removed from auto-route loop — explicit AdminRoute in App.jsx
    "DeviceConnect": DeviceConnect,
    "DeviceStats": DeviceStats,
    "FoodDatabase": FoodDatabase,
    "FoodImport": FoodImport,
    "GoogleAuthSetup": GoogleAuthSetup,
    "Home": Home,
    "MagicLogin": MagicLogin,
    "ManageModules": ManageModules,
    "ManageTrainees": ManageTrainees,
    "MessagingCenter": MessagingCenter,
    "Metrics": Metrics,
    "MyFavorites": MyFavorites,
    "NotificationCenter": NotificationCenter,
    "NutritionLog": NutritionLog,
    "OnlineTraining": OnlineTraining,
    "OnlineTrainingCoach": OnlineTrainingCoach,
    "OnlineTrainingCoachV2": OnlineTrainingCoachV2,
    "PendingApproval": PendingApproval,
    "PendingFoods": PendingFoods,
    "PerformOnlineWorkout": PerformOnlineWorkout,
    "SendDailyPersonal": SendDailyPersonal,
    "LoginWithPassword": LoginWithPassword,
    "SetPassword": SetPassword,
    "SuggestFavoritesManager": SuggestFavoritesManager,
    "SyncUsers": SyncUsers,
    "SystemAuditLogs": SystemAuditLogs,
    "SystemCare": SystemCare,
    "SystemNotificationsManager": SystemNotificationsManager,
    // SystemTest removed from auto-route loop — explicit AdminRoute in App.jsx
    "TemplateManager": TemplateManager,
    "TraineeCard360": TraineeCard360,
    "TraineeDailyWorkout": TraineeDailyWorkout,
    "TraineeGroupWorkouts": TraineeGroupWorkouts,
    "TraineeHome": TraineeHome,
    "TraineeManagement": TraineeManagement,
    "TraineeNotifications": TraineeNotifications,
    "TraineeOnlineTraining": TraineeOnlineTraining,
    "TraineeOnlineWorkouts": TraineeOnlineWorkouts,
    "TraineeProfile": TraineeProfile,
    // TraineeQA removed from auto-route loop — explicit AdminRoute in App.jsx
    "UnitsDebug": UnitsDebug,
    "WaterLog": WaterLog,
    "WhatsAppManager": WhatsAppManager,
    "WorkoutDetails": WorkoutDetails,
    "WorkoutLog": WorkoutLog,
    "WorkoutSession": WorkoutSession,
}

export const pagesConfig = {
    mainPage: "TraineeHome",
    Pages: PAGES,
    Layout: __Layout,
};
