import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, LayoutGrid, List as ListIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { Books } from '@phosphor-icons/react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { getFamiliesList } from '../config/techniqueRegistry';
import { sectionOf, SECTION_ORDER, subcategoryKey } from '../config/techniqueSections';
import { SECTION_ICONS } from '../config/icons';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import TechniqueModal from '../components/ui/TechniqueModal';
import FamilyIcon from '../components/ui/FamilyIcon';
import FamilyFacets from '../components/catalog/FamilyFacets';
import { TechniqueCard, TechniqueRow } from '../components/catalog/TechniqueCard';
import { searchBlob, norm } from '../components/catalog/catalogUtils';
import '../components/catalog/catalog.css';

// O Catálogo é a documentação completa (ativas + "em desenvolvimento"), diferente do editor de
// workflow, que só lista as ativas. A API limita cada página a 200 linhas, então busca todas.
async function fetchAll(lang) {
  const first = await api.techniques.list({ include_inactive: 'true', limit: 200, page: 1, lang });
  const body = first.data ?? {};
  let rows = body.data ?? [];
  const pages = body.meta?.total_pages ?? 1;
  for (let p = 2; p <= pages; p += 1) {
    const next = await api.techniques.list({ include_inactive: 'true', limit: 200, page: p, lang });
    rows = rows.concat(next.data?.data ?? []);
  }
  return { data: { data: rows } };
}

const readPref = (k, d) => { try { return localStorage.getItem(`tchelab_cat_${k}`) || d; } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(`tchelab_cat_${k}`, v); } catch { /* storage indisponível */ } };

export default function CatalogPage() {
  const { t, i18n } = useTranslation();
  const lang = String(i18n.language || 'pt').slice(0, 2);
  // refaz a busca quando o idioma muda: a API devolve os textos já traduzidos
  const { data, loading } = useApi(() => fetchAll(lang), [lang]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all'); // all | active | dev
  const [family, setFamily] = useState('all');
  const [sort, setSort] = useState(() => readPref('sort', 'pipeline')); // pipeline | name
  const [view, setView] = useState(() => readPref('view', 'grid')); // grid | list
  const [collapsed, setCollapsed] = useState({});
  const [modalTech, setModalTech] = useState(null);
  const searchRef = useRef(null);

  // atalho "/" foca a busca (como em GitHub, Notion, etc.), sem atrapalhar quem já está digitando
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      e.preventDefault(); searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = useMemo(() => (data?.data ?? data ?? []).filter((x) => !x.is_custom), [data]);
  const families = useMemo(() => getFamiliesList(lang), [lang]);
  const blobs = useMemo(() => new Map(all.map((x) => [x.uuid, searchBlob(x, subcategoryKey(x) ? t(subcategoryKey(x)) : '')])), [all, t]);

  const q = norm(search.trim());
  const textOk = useCallback((x) => !q || blobs.get(x.uuid)?.includes(q), [q, blobs]);
  const statusOk = (x) => status === 'all' || (status === 'active' ? !!x.active : !x.active);

  // cada faceta é contada com os OUTROS filtros aplicados (o usuário vê o efeito antes de clicar)
  const familyCounts = useMemo(() => {
    const c = {};
    for (const x of all) if (textOk(x) && statusOk(x)) c[x.family] = (c[x.family] || 0) + 1;
    return c;
  }, [all, textOk, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const statusCounts = useMemo(() => {
    const c = { all: 0, active: 0, dev: 0 };
    for (const x of all) if (textOk(x) && (family === 'all' || x.family === family)) { c.all += 1; c[x.active ? 'active' : 'dev'] += 1; }
    return c;
  }, [all, textOk, family]);

  const filtered = useMemo(() => all.filter((x) => textOk(x) && statusOk(x) && (family === 'all' || x.family === family)),
    [all, textOk, status, family]); // eslint-disable-line react-hooks/exhaustive-deps

  const byName = (a, b) => a.name.localeCompare(b.name, lang);
  const groups = useMemo(() => {
    if (sort === 'name') return [{ key: 'all', family: null, items: [...filtered].sort(byName) }];
    const g = new Map();
    for (const x of filtered) { if (!g.has(x.family)) g.set(x.family, []); g.get(x.family).push(x); }
    return families.filter((f) => g.has(f.slug)).map((f) => ({ key: f.slug, family: f, items: g.get(f.slug).sort(byName) }));
  }, [filtered, families, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = all.filter((x) => x.active).length;
  const devCount = all.length - activeCount;
  const filtersOn = !!q || status !== 'all' || family !== 'all';
  const clearAll = () => { setSearch(''); setStatus('all'); setFamily('all'); };
  const toggle = (k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const renderItems = (items) => (view === 'list'
    ? <div className="cat-list">{items.map((x) => <TechniqueRow key={x.uuid} tech={x} query={search} onOpen={setModalTech} />)}</div>
    : <div className="cat-grid">{items.map((x) => <TechniqueCard key={x.uuid} tech={x} query={search} onOpen={setModalTech} />)}</div>);

  const renderGroupBody = (grp) => {
    // família grande (ex.: Dados & I/O) ganha subseções
    const sections = grp.family && grp.items.some((x) => sectionOf(x));
    if (!sections) return renderItems(grp.items);
    return SECTION_ORDER.map((s) => {
      const items = grp.items.filter((x) => sectionOf(x) === s);
      if (!items.length) return null;
      const Icon = SECTION_ICONS[s];
      return (
        <div key={s}>
          <h3 className="cat-subhead">{Icon && <Icon size={14} weight="duotone" aria-hidden />}{t(`catalog.section.${s}`)} <span style={{ fontWeight: 400 }}>· {items.length}</span></h3>
          {renderItems(items)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-5" data-testid="catalog-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
            <Books size={28} weight="duotone" style={{ color: 'var(--text-accent)' }} aria-hidden /> {t('catalog.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('catalog.subtitle', { active: activeCount, dev: devCount })}</p>
        </div>
      </header>

      <div className="cat-toolbar" role="search">
        <div className="cat-search">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} aria-hidden />
          <input ref={searchRef} className="input-field" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('catalog.searchPlaceholder')}
            aria-label={t('catalog.searchPlaceholder')} data-testid="catalog-search" />
          {search
            ? <button type="button" className="cat-clear btn-ghost" style={{ padding: 4 }} onClick={() => { setSearch(''); searchRef.current?.focus(); }} aria-label={t('catalog.clearSearch')}><X className="w-4 h-4" /></button>
            : <span className="cat-kbd" aria-hidden title={t('catalog.searchHint')}>/</span>}
        </div>
        <div className="cat-seg" role="group" aria-label={t('catalog.statusTabs')} data-testid="status-tabs">
          {[['all', t('catalog.tabAll')], ['active', t('catalog.tabActive')], ['dev', t('catalog.tabDev')]].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} data-testid={`status-${k}`}>{label} <span className="cat-n">{statusCounts[k]}</span></button>
          ))}
        </div>
        <label className="sr-only" htmlFor="cat-sort">{t('catalog.sort')}</label>
        <select id="cat-sort" className="input-field" style={{ width: 'auto' }} value={sort} onChange={(e) => { setSort(e.target.value); writePref('sort', e.target.value); }} data-testid="catalog-sort">
          <option value="pipeline">{t('catalog.sort')}: {t('catalog.sortPipeline')}</option>
          <option value="name">{t('catalog.sort')}: {t('catalog.sortName')}</option>
        </select>
        <div className="cat-seg icons" role="group" aria-label={t('catalog.view')}>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => { setView('grid'); writePref('view', 'grid'); }} title={t('catalog.viewGrid')} aria-label={t('catalog.viewGrid')} data-testid="view-grid"><LayoutGrid className="w-4 h-4" /></button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => { setView('list'); writePref('view', 'list'); }} title={t('catalog.viewList')} aria-label={t('catalog.viewList')} data-testid="view-list"><ListIcon className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="cat-layout">
        <FamilyFacets families={families} counts={familyCounts} total={Object.values(familyCounts).reduce((a, b) => a + b, 0)} value={family} onChange={setFamily} />

        <div className="min-w-0 space-y-6">
          {!loading && (
            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }} aria-live="polite" data-testid="catalog-summary">
              <span>{t('catalog.showing', { shown: filtered.length, total: all.length })}</span>
              {filtersOn && <button type="button" className="btn-ghost text-sm" onClick={clearAll} data-testid="clear-filters">{t('catalog.clearFilters')}</button>}
            </div>
          )}

          {loading ? (
            <div className="cat-grid">{Array(9).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Books} title={t('catalog.emptyTitle')} description={t('catalog.emptyDesc')}
              action={filtersOn ? <button type="button" className="btn-primary" onClick={clearAll}>{t('catalog.clearFilters')}</button> : null} />
          ) : (
            groups.map((grp) => {
              if (!grp.family) return <div key={grp.key}>{renderItems(grp.items)}</div>;
              const open = !collapsed[grp.key];
              const Chev = open ? ChevronDown : ChevronRight;
              return (
                <section key={grp.key} aria-labelledby={`fam-${grp.key}`} data-testid={`family-section-${grp.key}`}>
                  <button type="button" className="cat-section-head" onClick={() => toggle(grp.key)} aria-expanded={open}
                    title={t(open ? 'catalog.collapseSection' : 'catalog.expandSection', { name: grp.family.labelStr })}>
                    <FamilyIcon family={grp.family.slug} color={grp.family.color} bg={grp.family.bg} size={30} />
                    <h2 id={`fam-${grp.key}`}>{grp.family.labelStr}</h2>
                    <span className="cat-count">{t('catalog.techCount', { count: grp.items.length })}</span>
                    <Chev className="w-4 h-4 ml-auto" style={{ color: 'var(--text-muted)' }} aria-hidden />
                  </button>
                  {open && <div className="mt-3">{renderGroupBody(grp)}</div>}
                </section>
              );
            })
          )}
        </div>
      </div>

      <TechniqueModal open={!!modalTech} onClose={() => setModalTech(null)} technique={modalTech} />
    </div>
  );
}
