export const GRADIENTS = {
  aurora: {
    label: '极光',
    accent: '#7f9cff',
    css: 'radial-gradient(90% 80% at 15% 10%, rgba(76, 104, 214, 0.55), transparent 60%), radial-gradient(70% 70% at 82% 68%, rgba(130, 92, 214, 0.4), transparent 62%), linear-gradient(145deg, #080c1a 0%, #111a38 48%, #1a1430 100%)'
  },
  dusk: {
    label: '暮紫',
    accent: '#c38cff',
    css: 'radial-gradient(80% 80% at 78% 18%, rgba(159, 85, 206, 0.52), transparent 62%), radial-gradient(90% 70% at 12% 86%, rgba(89, 56, 144, 0.4), transparent 66%), linear-gradient(150deg, #0d0a14 0%, #221530 48%, #180d24 100%)'
  },
  moss: {
    label: '苔绿',
    accent: '#6fdfb4',
    css: 'radial-gradient(85% 75% at 18% 20%, rgba(42, 132, 104, 0.5), transparent 62%), radial-gradient(80% 80% at 82% 78%, rgba(30, 84, 74, 0.55), transparent 64%), linear-gradient(150deg, #06100d 0%, #0e2a23 50%, #071c19 100%)'
  },
  ember: {
    label: '余烬',
    accent: '#ffb27d',
    css: 'radial-gradient(80% 75% at 78% 20%, rgba(190, 89, 47, 0.5), transparent 62%), radial-gradient(90% 80% at 12% 82%, rgba(104, 49, 36, 0.55), transparent 68%), linear-gradient(150deg, #120b08 0%, #2c1710 48%, #1b0e0b 100%)'
  },
  mono: {
    label: '石墨',
    accent: '#c9d2e7',
    css: 'radial-gradient(80% 75% at 20% 16%, rgba(120, 132, 159, 0.23), transparent 62%), radial-gradient(75% 75% at 82% 80%, rgba(78, 87, 108, 0.32), transparent 64%), linear-gradient(150deg, #08090d 0%, #181b23 50%, #0b0c11 100%)'
  }
};

export const SOLID_SWATCHES = ['#101522', '#18233d', '#1c2934', '#2b2138', '#2e1b1b', '#152b26', '#2a2a30'];

export function accentFor(background) {
  if (!background) return '#7797ff';
  if (background.type === 'solid') return background.color || '#7797ff';
  if (background.type === 'gradient') {
    return (GRADIENTS[background.gradient] || GRADIENTS.aurora).accent;
  }
  return '#7797ff';
}

export function coverBackgroundStyle(background) {
  if (!background) return {};
  if (background.type === 'solid') {
    return {
      backgroundColor: background.color || '#101522',
      backgroundImage: 'radial-gradient(90% 80% at 20% 10%, rgba(255,255,255,0.08), transparent 60%)'
    };
  }
  if (background.type === 'image' && background.imageUrl) {
    return {
      backgroundImage: `linear-gradient(90deg, rgba(6,8,14,0.45), rgba(6,8,14,0.05)), url("${background.imageUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }
  return { backgroundImage: (GRADIENTS[background.gradient] || GRADIENTS.aurora).css };
}
