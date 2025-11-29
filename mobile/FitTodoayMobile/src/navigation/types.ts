export type AuthStackParamList = {
  Landing: undefined;
  Onboarding: {
    email?: string;
    password?: string;
    name?: string;
  };
};

export type MainTabParamList = {
  Programs: undefined;
  Workout: { date?: string } | undefined;
  Analytics: undefined;
  Assistant: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
