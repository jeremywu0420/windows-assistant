import React from 'react';
import { useLocale } from '../../i18n.jsx';

function activityLabel(type) {
  const labels = {
    cleanup: 'Cleanup',
    downloads: 'Files',
    screenshots: 'Screens',
    notification: 'Notice',
  };
  return labels[type] || 'Task';
}

export default function RecentActivities({ activities = [], onNavigate }) {
  const { t } = useLocale();
  const rows = activities.slice(0, 6);
  return (
    <section className="glass-card dashboard-panel">
      <div className="panel-heading">
        <span>{t('dashboard.recentActivities')}</span>
        <button type="button" onClick={() => onNavigate('history')}>
          {t('dashboard.viewAll')}
        </button>
      </div>
      {rows.length ? (
        <div className="activity-list">
          {rows.map((activity) => (
            <button
              type="button"
              className="activity-row"
              key={activity.id}
              onClick={() =>
                onNavigate(
                  activity.type === 'cleanup'
                    ? 'cleanup'
                    : activity.type === 'downloads'
                      ? 'files'
                      : 'history',
                )
              }
            >
              <span className={`activity-dot type-${activity.type}`} />
              <span>
                <strong>{activity.title || activityLabel(activity.type)}</strong>
                <em>{activity.summary || activityLabel(activity.type)}</em>
              </span>
              <time>{activity.time ? new Date(activity.time).toLocaleDateString() : '--'}</time>
            </button>
          ))}
        </div>
      ) : (
        <div className="dash-empty">
          <strong>{t('dashboard.noActivities')}</strong>
          <span>{t('dashboard.noActivitiesHint')}</span>
        </div>
      )}
    </section>
  );
}
