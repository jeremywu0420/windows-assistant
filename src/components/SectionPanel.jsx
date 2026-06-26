import React from 'react';

export default function SectionPanel({
  title,
  eyebrow,
  description,
  actions,
  children,
  className = '',
}) {
  return (
    <section className={`section-panel ${className}`.trim()}>
      {title || description || actions ? (
        <div className="section-panel-head">
          <div>
            {eyebrow ? <div className="panel-label">{eyebrow}</div> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="head-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
