export const BETA_MODE = typeof window !== 'undefined'
  && localStorage.getItem('startupintelligence-beta-mode') === 'true';
