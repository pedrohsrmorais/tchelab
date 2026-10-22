import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, Globe, Lock, LogIn, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { coverBackground } from '../config/profileCovers';
import { parseApiError } from '../utils/errors';
import { Spinner } from '../components/ui/Spinner';

/** /join/:code — abre o convite, mostra a comunidade e entra com um clique. */
export default function JoinCommunityPage() {
  const { t } = useTranslation();
  const { code } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, preview: null, error: null });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let alive = true;
    api.communities.previewInvite(code)
      .then(res => alive && setState({ loading: false, preview: res.data?.data ?? res.data, error: null }))
      .catch(err => alive && setState({ loading: false, preview: null, error: parseApiError(err).status === 404 ? 'invalid' : 'generic' }));
    return () => { alive = false; };
  }, [code]);

  const join = async () => {
    setJoining(true);
    try {
      const res = await api.communities.joinWithCode(code);
      const d = res.data?.data ?? res.data;
      toast.success(d.joined ? t('communities.joinedSuccess') : t('communities.alreadyMember'));
      navigate(`/communities/${d.uuid}`, { replace: true });
    } catch (err) {
      toast.error(parseApiError(err, t('common.error')).message);
    } finally { setJoining(false); }
  };

  const { loading, preview, error } = state;
  const c = preview?.community;
  const unusable = preview && preview.status !== 'active' && !preview.is_member;

  return (
    <div className="max-w-lg mx-auto mt-8">
      {loading && <div className="flex justify-center py-16"><Spinner /></div>}

      {!loading && error && (
        <div className="card p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('communities.inviteInvalid')}</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('communities.inviteInvalidDesc')}</p>
          <Link to="/communities" className="btn-primary inline-block">{t('communities.backToCommunities')}</Link>
        </div>
      )}

      {!loading && c && (
        <div className="card overflow-hidden">
          <div style={{ height: 96, background: coverBackground(c.cover_color) }} />
          <div className="p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{t('communities.invitedTo')}</p>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{c.name}</h1>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{c.description || t('common.noDescription')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {t('communities.memberCount', { count: c.member_count })}</span>
              <span className="flex items-center gap-1">
                {c.visibility === 'public' ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {c.visibility === 'public' ? t('communities.public') : t('communities.private')}
              </span>
              <span>{t('communities.createdBy', { name: c.owner_name })}</span>
            </div>

            {unusable && (
              <p className="text-sm rounded-lg p-3" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                {t(`communities.inviteStatus.${preview.status}`)}
              </p>
            )}

            {preview.is_member ? (
              <Link to={`/communities/${c.uuid}`} className="btn-primary w-full inline-flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> {t('communities.openCommunity')}
              </Link>
            ) : (
              <button onClick={join} disabled={joining || unusable} className="btn-primary w-full flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> {joining ? t('communities.joining') : t('communities.joinCommunity')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
