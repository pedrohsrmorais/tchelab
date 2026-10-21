import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Cog, Lightbulb, Tag,
  LogIn, LogOut as LogOutIcon,
  CheckCircle2, Hammer, ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { getFamilyConfig, getPorts } from '../../config/techniqueRegistry';

// ─── helpers ────────────────────────────────────────────────────────────────

function safeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function StatusBadge({ active }) {
  const { t } = useTranslation();
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
      <CheckCircle2 className="w-3 h-3" /> {t('catalog.activeBeta')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">
      <Hammer className="w-3 h-3" /> {t('catalog.inDevelopment')}
    </span>
  );
}

function Section({ icon: Icon, title, children, iconColor = '#60a5fa' }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
        <Icon size={14} style={{ color: iconColor, flexShrink: 0 }} /> {title}
      </h3>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function PortTable({ title, ports, accent }) {
  const { t } = useTranslation();
  return (
    <div>
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '0 0 8px' }}>
        {title}
      </h4>
      {!ports.length ? (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{t('catalog.noPortsDocumented')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ports.map((p) => (
            <div key={p.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <code style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 4, background: `${accent}22`, color: accent, fontWeight: 700 }}>
                  {p.name}
                </code>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.type}</span>
                {p.shape && <span style={{ fontSize: '0.65rem', color: 'rgba(148,163,184,0.5)' }}>shape {p.shape}</span>}
              </div>
              {p.description
                ? <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.description}</p>
                : <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('catalog.noDescriptionYet')}</p>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

/**
 * TechniqueModal — shows technique documentation as a centered overlay.
 *
 * Props:
 *   open      {boolean}  – controls visibility
 *   onClose   {function} – called when user dismisses the modal
 *   technique {object}   – full technique object from the API (must be provided)
 */
export default function TechniqueModal({ open, onClose, technique: tech }) {
  const { t } = useTranslation();

  if (!tech) return null;

  const fam     = getFamilyConfig(tech.family);
  const inputs  = getPorts(tech.input_schema);
  const outputs = getPorts(tech.output_schema);
  const tags    = safeJson(tech.tags, []);

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {fam && (
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700,
                  padding: '2px 10px', borderRadius: 999,
                  background: fam.bg, color: fam.color, border: `1px solid ${fam.border}`,
                }}>
                  {fam.labelStr || tech.family}
                </span>
              )}
              <code style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {tech.slug}
              </code>
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.25 }}>
              {tech.name}
            </h2>
            <StatusBadge active={!!tech.active} />
          </div>
          {tech.uuid && (
            <Link
              to={`/catalogo/${tech.uuid}`}
              onClick={onClose}
              title={t('catalog.backToCatalog')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.75rem', color: 'var(--text-muted)',
                textDecoration: 'none', flexShrink: 0, paddingTop: 2,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <ExternalLink size={13} />
              {t('catalog.fullPage', 'Página completa')}
            </Link>
          )}
        </div>

        {/* ── Description ───────────────────────────────────────────── */}
        <Section icon={BookOpen} title={t('catalog.whatIsIt')}>
          {tech.description || t('catalog.noDescriptionRegistered')}
        </Section>

        {/* ── How it works ──────────────────────────────────────────── */}
        {tech.how_it_works && (
          <Section icon={Cog} title={t('catalog.howItWorks')} iconColor="#a78bfa">
            {tech.how_it_works}
          </Section>
        )}

        {/* ── Usage tips ────────────────────────────────────────────── */}
        {tech.usage_tips && (
          <Section icon={Lightbulb} title={t('catalog.usageTips')} iconColor="#facc15">
            {tech.usage_tips}
          </Section>
        )}

        {/* ── Input / Output ────────────────────────────────────────── */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            <Tag size={14} style={{ color: '#60a5fa' }} /> {t('catalog.inputOutput')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PortTable
              title={<><LogIn size={11} /> {t('catalog.expectedInput')}</>}
              ports={inputs}
              accent="#60a5fa"
            />
            <PortTable
              title={<><LogOutIcon size={11} /> {t('catalog.producedOutput')}</>}
              ports={outputs}
              accent="#4ade80"
            />
          </div>
        </div>

        {/* ── Historical note ───────────────────────────────────────── */}
        {tech.historical_note && (
          <Section icon={Lightbulb} title={t('catalog.historicalNote')} iconColor="#f59e0b">
            {tech.historical_note}
          </Section>
        )}

        {/* ── Tags ──────────────────────────────────────────────────── */}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tag) => (
              <span key={tag} style={{
                fontSize: '0.7rem', padding: '2px 8px', borderRadius: 999,
                background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

      </div>
    </Modal>
  );
}
