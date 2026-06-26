import React from 'react';
import { useLocale } from '../../i18n.jsx';

function timeAgo(value) {
  if (!value) return '--';
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return '--';
  const minutes = Math.max(0, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function tempLevel(value) {
  if (value == null) return 'normal';
  if (value >= 90) return 'danger';
  if (value >= 78) return 'warning';
  return 'good';
}

function formatTemp(value) {
  return value == null ? '--' : `${value}°C`;
}

function normalizePinned(projects = {}) {
  return (projects.pinnedProjects || []).slice(0, 5);
}

export default function FileAnalytics({ projects, system, notifications, onNavigate }) {
  const { t } = useLocale();
  const pinnedProjects = normalizePinned(projects);
  const cpuCores = (system?.metrics?.temperatures?.cpuCores || []).slice(0, 10);
  const recentProjects = (projects?.recentProjects || []).slice(0, 5);
  const notices = (notifications?.events || []).slice(0, 5);

  return (
    <div className="dashboard-bottom-grid dashboard-bottom-focus">
      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.pinnedProjects')}</span>
          <button type="button" onClick={() => onNavigate('projects')}>
            {t('dashboard.hub')}
          </button>
        </div>
        <div className="project-mini-list">
          {pinnedProjects.length ? (
            pinnedProjects.map((project) => (
              <button
                type="button"
                key={project.path || project.name}
                onClick={() => onNavigate('projects')}
              >
                <strong>{project.name || 'Project'}</strong>
                <span>{project.path || t('dashboard.unavailable')}</span>
              </button>
            ))
          ) : (
            <div className="dash-empty compact">
              <strong>{t('dashboard.noPinnedProjects')}</strong>
              <span>{t('dashboard.noPinnedProjectsHint')}</span>
            </div>
          )}
        </div>
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.cpuCoreTemps')}</span>
          <button type="button" onClick={() => onNavigate('monitor')}>
            {t('dashboard.open')}
          </button>
        </div>
        {cpuCores.length ? (
          <div className="cpu-core-grid">
            {cpuCores.map((core, index) => (
              <div
                className={`cpu-core-tile tone-${tempLevel(core.temperatureC)} ${core.stabilized ? 'is-stabilized' : ''}`}
                key={core.id || core.name || index}
                title={
                  core.rawTemperatureC == null
                    ? undefined
                    : `Raw ${formatTemp(core.rawTemperatureC)} / samples ${core.sampleCount || 1}`
                }
              >
                <span>{core.name || `Core ${index + 1}`}</span>
                <strong>{formatTemp(core.temperatureC)}</strong>
                {typeof core.loadPercent === 'number' ? <em>{core.loadPercent}% load</em> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="dash-empty compact">
            <strong>{t('dashboard.noCpuTemps')}</strong>
            <span>{t('dashboard.noCpuTempsHint')}</span>
          </div>
        )}
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.recentActiveProjects')}</span>
          <button type="button" onClick={() => onNavigate('projects')}>
            {t('dashboard.hub')}
          </button>
        </div>
        <div className="project-mini-list">
          {recentProjects.length ? (
            recentProjects.map((project) => (
              <button
                type="button"
                key={project.path || project.name}
                onClick={() => onNavigate('projects')}
              >
                <strong>{project.name}</strong>
                <span>
                  {project.category || 'Project'} ·{' '}
                  {project.totalFileCount || project.detectedFileCount || 0} {t('dashboard.files')}{' '}
                  · {timeAgo(project.lastModified)}
                </span>
              </button>
            ))
          ) : (
            <div className="dash-empty compact">
              <strong>{t('dashboard.noProjects')}</strong>
              <span>{t('dashboard.noProjectsHint')}</span>
            </div>
          )}
        </div>
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.notificationMessages')}</span>
          <button type="button" onClick={() => onNavigate('notifications')}>
            {t('dashboard.viewAll')}
          </button>
        </div>
        <div className="notice-list">
          {notices.length ? (
            notices.map((notice) => (
              <button
                type="button"
                className={`notice-row level-${notice.level || 'info'} ${notice.read ? 'is-read' : ''}`}
                key={notice.id}
                onClick={() => onNavigate('notifications')}
              >
                <i />
                <span>
                  <strong>{notice.title || 'PC Life Assistant'}</strong>
                  <em>{notice.body || notice.source || '--'}</em>
                </span>
                <time>{timeAgo(notice.time)}</time>
              </button>
            ))
          ) : (
            <div className="dash-empty compact">
              <strong>{t('dashboard.noNotifications')}</strong>
              <span>{t('dashboard.noNotificationsHint')}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
