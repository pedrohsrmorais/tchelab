import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import {
  LayoutDashboard, FolderKanban, Database, GitBranch, Beaker,
  BookOpen, Users, Cpu, Briefcase, Wand2, Zap, ShieldCheck,
  LogOut, ChevronRight, Sparkles
} from 'lucide-react'

const NAV = [
  { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard' },
  { to:'/projects',  icon:FolderKanban,   label:'Projetos' },
  { to:'/datasets',  icon:Database,        label:'Datasets' },
  { to:'/workflows', icon:GitBranch,       label:'Workflows' },
  { to:'/articles',  icon:BookOpen,        label:'Artigos' },
  { to:'/communities',icon:Users,          label:'Comunidades' },
  { to:'/models',    icon:Cpu,             label:'Modelos' },
  { to:'/jobs',      icon:Zap,             label:'Jobs' },
]

const AI_NAV = [
  { to:'/ai',        icon:Sparkles,        label:'IA Assistente', plus:true },
]

const ADMIN_NAV = [
  { to:'/admin',     icon:ShieldCheck,     label:'Admin' },
]

export function Sidebar({ collapsed, onToggle }) {
  const { user, logout, isPlus, isAdmin } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const w = collapsed ? 72 : 240

  return (
    <aside style={{
      width: w, minHeight:'100vh', background:'rgba(15,23,42,0.95)',
      borderRight:'1px solid rgba(255,255,255,0.07)', display:'flex', flexDirection:'column',
      transition:'width 0.3s cubic-bezier(0.16,1,0.3,1)', flexShrink:0, position:'sticky', top:0
    }}>
      {/* Logo */}
      <div style={{ padding:'1.25rem 1rem', display:'flex', alignItems:'center', gap:'0.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', cursor:'pointer' }} onClick={onToggle}>
        <div style={{ width:36, height:36, flexShrink:0, borderRadius:10, background:'linear-gradient(135deg,#2563eb,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(37,99,235,0.4)' }}>
          <TcheLabLogo size={20} />
        </div>
        {!collapsed && (
          <div style={{ overflow:'hidden' }}>
            <p style={{ fontWeight:800, fontSize:'1rem', color:'#fff', lineHeight:1.1 }}>TcheLab</p>
            <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.08em' }}>QUIMIOMETRIA</p>
          </div>
        )}
        <div style={{ marginLeft:'auto', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition:'transform 0.3s', flexShrink:0 }}>
          <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'0.5rem 0.5rem', display:'flex', flexDirection:'column', gap:'2px', overflowY:'auto' }}>
        {NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}

        {(isPlus() || true) && (
          <>
            <div style={{ margin:'0.75rem 0.25rem 0.25rem', fontSize:'0.6rem', fontWeight:700, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', paddingLeft:'0.5rem' }}>
              {!collapsed && 'INTELIGÊNCIA ARTIFICIAL'}
            </div>
            {AI_NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} isPlus={!isPlus()} />)}
          </>
        )}

        {isAdmin() && (
          <>
            <div style={{ margin:'0.75rem 0.25rem 0.25rem', fontSize:'0.6rem', fontWeight:700, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', paddingLeft:'0.5rem' }}>
              {!collapsed && 'ADMIN'}
            </div>
            {ADMIN_NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          </>
        )}
      </nav>

      {/* User */}
      <div style={{ padding:'0.75rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        {!collapsed && (
          <div style={{ padding:'0.75rem', borderRadius:'0.75rem', background:'rgba(255,255,255,0.04)', marginBottom:'0.5rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <Avatar name={user?.name || user?.email} size={32} />
            <div style={{ overflow:'hidden', flex:1 }}>
              <p style={{ fontWeight:600, fontSize:'0.8rem', color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.name || 'Usuário'}</p>
              <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.35)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</p>
            </div>
            {isPlus() && <span className="badge-plus" style={{ fontSize:'0.6rem', flexShrink:0 }}>PLUS</span>}
          </div>
        )}
        <button onClick={handleLogout} className="btn-ghost" style={{ width:'100%', justifyContent: collapsed ? 'center' : 'flex-start', padding:'0.5rem 0.75rem', borderRadius:'0.75rem' }}>
          <LogOut size={16} />
          {!collapsed && <span style={{ fontSize:'0.8rem' }}>Sair</span>}
        </button>
      </div>
    </aside>
  )
}

function NavItem({ to, icon: Icon, label, collapsed, plus, isPlus: locked }) {
  return (
    <NavLink to={to} style={{ textDecoration:'none' }}>
      {({ isActive }) => (
        <div style={{
          display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.6rem 0.75rem', borderRadius:'0.75rem',
          cursor:'pointer', transition:'all 0.15s', position:'relative',
          background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
          border: isActive ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
          color: isActive ? '#60a5fa' : 'rgba(255,255,255,0.55)',
          justifyContent: collapsed ? 'center' : 'flex-start',
          opacity: locked ? 0.5 : 1,
        }}>
          <Icon size={17} style={{ flexShrink:0 }} />
          {!collapsed && (
            <span style={{ fontSize:'0.82rem', fontWeight: isActive ? 600 : 400, whiteSpace:'nowrap', flex:1 }}>{label}</span>
          )}
          {!collapsed && plus && !locked && <span className="badge-plus" style={{ fontSize:'0.55rem' }}>PLUS</span>}
          {isActive && !collapsed && <div style={{ position:'absolute', left:0, top:'20%', bottom:'20%', width:3, background:'#3b82f6', borderRadius:'0 2px 2px 0' }} />}
        </div>
      )}
    </NavLink>
  )
}

function Avatar({ name, size = 36 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
  const hue = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 60 + 200
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`hsl(${hue},70%,35%)`,
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                  fontSize: size * 0.35, fontWeight:700, color:'#fff', letterSpacing:'-0.02em' }}>
      {initials}
    </div>
  )
}

function TcheLabLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M10 14h20M20 14v14M14 20h12" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="20" cy="14" r="3" fill="#93c5fd"/>
      <circle cx="20" cy="28" r="3" fill="#93c5fd"/>
    </svg>
  )
}

export default Sidebar;
