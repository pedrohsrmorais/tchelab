// Capas de perfil/comunidade: a chave é gravada no banco (users.cover_color / communities.cover_color).
export const COVERS = {
  'gradient-primary': 'linear-gradient(135deg, #1d4ed8 0%, #6366f1 100%)',
  'gradient-ocean':   'linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%)',
  'gradient-forest':  'linear-gradient(135deg, #059669 0%, #065f46 100%)',
  'gradient-sunset':  'linear-gradient(135deg, #f97316 0%, #be123c 100%)',
  'gradient-violet':  'linear-gradient(135deg, #8b5cf6 0%, #4c1d95 100%)',
  'gradient-rose':    'linear-gradient(135deg, #ec4899 0%, #9d174d 100%)',
  'gradient-teal':    'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
  'gradient-slate':   'linear-gradient(135deg, #64748b 0%, #1e293b 100%)',
};
export const COVER_KEYS = Object.keys(COVERS);
export const coverBackground = (key) => COVERS[key] || COVERS['gradient-primary'];
