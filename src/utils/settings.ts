export interface AppSettings {
  autoSnapshot: boolean;
  autoSnapshotTime: string; // HH:mm 형식
  lastAutoSnapshotDate: string | null; // ISO date string
}

const SETTINGS_KEY = 'portfolio_settings';

const defaultSettings: AppSettings = {
  autoSnapshot: false,
  autoSnapshotTime: '09:00', // 오전 9시 (장 시작 전)
  lastAutoSnapshotDate: null,
};

export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('설정 로드 실패:', error);
  }
  return defaultSettings;
};

export const saveSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('설정 저장 실패:', error);
  }
};
