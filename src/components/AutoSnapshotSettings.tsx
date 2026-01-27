import { useState, useEffect } from 'react';
import { AppSettings, loadSettings, saveSettings } from '../utils/settings';

interface AutoSnapshotSettingsProps {
  onSettingsChange: (settings: AppSettings) => void;
}

export const AutoSnapshotSettings = ({ onSettingsChange }: AutoSnapshotSettingsProps) => {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const saved = loadSettings();
    setSettings(saved);
    onSettingsChange(saved);
  }, []);

  const handleToggle = (enabled: boolean) => {
    const newSettings: AppSettings = {
      ...settings,
      autoSnapshot: enabled,
    };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleTimeChange = (time: string) => {
    const newSettings: AppSettings = {
      ...settings,
      autoSnapshotTime: time,
    };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const getLastSnapshotDate = () => {
    if (!settings.lastAutoSnapshotDate) {
      return '아직 생성된 적 없음';
    }
    const date = new Date(settings.lastAutoSnapshotDate);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="auto-snapshot-settings">
      <button
        className="settings-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '⚙️ 설정 닫기' : '⚙️ 자동 스냅샷 설정'}
      </button>

      {isOpen && (
        <div className="settings-content">
          <h3>자동 스냅샷 설정</h3>
          
          <div className="setting-item">
            <div className="setting-header">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.autoSnapshot}
                  onChange={(e) => handleToggle(e.target.checked)}
                  className="toggle-checkbox"
                />
                <span className="toggle-switch"></span>
                <span className="toggle-text">전일 종가 기준 자동 스냅샷</span>
              </label>
            </div>
            <p className="setting-description">
              매일 지정한 시간에 전일 종가 기준으로 자동으로 스냅샷을 생성합니다.
            </p>
          </div>

          {settings.autoSnapshot && (
            <div className="setting-item">
              <label className="time-label">
                자동 스냅샷 시간:
                <input
                  type="time"
                  value={settings.autoSnapshotTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="time-input"
                />
              </label>
              <p className="setting-hint">
                💡 권장: 오전 9시 (한국 장 시작 전) 또는 오후 4시 (미국 장 종료 후)
              </p>
            </div>
          )}

          <div className="setting-item">
            <div className="last-snapshot-info">
              <span className="info-label">마지막 자동 스냅샷:</span>
              <span className="info-value">{getLastSnapshotDate()}</span>
            </div>
          </div>

          <div className="setting-info-box">
            <h4>📌 자동 스냅샷 작동 방식</h4>
            <ul>
              <li>매일 지정한 시간에 자동으로 전일 종가 기준 스냅샷을 생성합니다</li>
              <li>브라우저가 열려있을 때만 작동합니다</li>
              <li>포트폴리오에 자산이 있어야 작동합니다</li>
              <li>같은 날에는 한 번만 생성됩니다</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
