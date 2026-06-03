import React from 'react';

interface SpriteProps {
  base: string;
  hair: string;
  outfit: string;
  accessory: string;
  petId?: string;
  size?: number;
  className?: string;
}

// Helper: Read the asset cache from localStorage synchronously.
// Falls back to empty array if cache not yet populated.
function getAssetCache(): { id: string; image_url: string; type: string }[] {
  try {
    return JSON.parse(localStorage.getItem('rpg_assets_cache') || '[]');
  } catch {
    return [];
  }
}

export const SpriteRenderer: React.FC<SpriteProps> = ({
  base,
  hair,
  outfit,
  accessory,
  petId = 'none',
  size = 48,
  className = ''
}) => {
  const assetCache = getAssetCache();

  // Check if the character base ID has a custom image in the cache
  const charAsset = assetCache.find(a => a.id === base && a.type === 'character' && a.image_url);
  // Check if the pet has a custom image in the cache
  const petAsset = assetCache.find(a => a.id === petId && a.type === 'pet' && a.image_url);

  // ─── Color helpers (legacy SVG rendering only) ─────────────────────────────

  const getSkinColor = () => {
    switch (base) {
      case 'base_2': return '#fcd5b5';
      case 'base_3': return '#d2b48c';
      case 'base_1':
      default: return '#ffe0bd';
    }
  };

  const getHairStyles = () => {
    let color = '#3a2e2b';
    if (hair.includes('red')) color = '#d90429';
    else if (hair.includes('yellow')) color = '#ffb703';
    else if (hair.includes('grey')) color = '#8d99ae';
    else if (hair.includes('black')) color = '#1a1a24';
    else if (hair.includes('brown')) color = '#7f5539';

    const isSpike = hair.includes('spike') || hair.includes('gold') || hair.includes('red');
    const isBob = hair.includes('bob') || hair.includes('brown') || hair.includes('yellow');

    if (isSpike) {
      return <path d="M 12,6 L 16,3 L 20,6 L 24,3 L 28,6 L 32,8 L 32,15 L 12,15 Z M 10,9 L 12,6 L 12,15 L 10,13 Z" fill={color} />;
    } else if (isBob) {
      return <path d="M 10,9 C 10,4 34,4 34,9 L 34,22 L 30,22 L 30,16 L 14,16 L 14,22 L 10,22 Z" fill={color} />;
    } else {
      return <path d="M 12,10 C 12,5 32,5 32,10 L 32,16 L 28,16 L 28,12 L 16,12 L 16,16 L 12,16 Z" fill={color} />;
    }
  };

  const getOutfitDetails = () => {
    let color = '#4ea8de';
    let logoColor = '#fff';
    if (outfit.includes('gold')) { color = '#ffd700'; logoColor = '#d90429'; }
    else if (outfit.includes('blue')) { color = '#1d3557'; logoColor = '#a8dadc'; }
    else if (outfit.includes('green')) { color = '#2a9d8f'; logoColor = '#e9c46a'; }
    else if (outfit.includes('red')) { color = '#e63946'; logoColor = '#f1faee'; }
    else if (outfit.includes('purple')) { color = '#7209b7'; logoColor = '#f72585'; }
    else if (outfit.includes('casual')) { color = '#e76f51'; logoColor = '#264653'; }
    return (
      <>
        <path d="M 14,28 L 30,28 L 32,42 L 12,42 Z" fill={color} />
        <rect x="18" y="28" width="8" height="3" fill={logoColor} />
        <circle cx="10" cy="33" r="3" fill={getSkinColor()} />
        <circle cx="34" cy="33" r="3" fill={getSkinColor()} />
      </>
    );
  };

  const getAccessory = () => {
    switch (accessory) {
      case 'crown':
        return <path d="M 16,5 L 18,1 L 22,5 L 26,1 L 30,5 L 32,9 L 12,9 Z" fill="#ffd700" stroke="#b58a00" strokeWidth="1" />;
      case 'glasses':
        return (
          <g stroke="#000" strokeWidth="2" fill="none">
            <rect x="14" y="16" width="6" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
            <rect x="24" y="16" width="6" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
            <line x1="20" y1="18" x2="24" y2="18" />
          </g>
        );
      case 'headset':
        return (
          <g>
            <path d="M 10,18 C 10,10 34,10 34,18" fill="none" stroke="#d90429" strokeWidth="3" />
            <rect x="8" y="16" width="4" height="7" rx="1" fill="#1a1a24" />
            <rect x="32" y="16" width="4" height="7" rx="1" fill="#1a1a24" />
            <path d="M 10,21 L 14,23" fill="none" stroke="#1a1a24" strokeWidth="1" />
          </g>
        );
      default:
        return null;
    }
  };

  const getPetSvg = () => {
    if (!petId || petId === 'none') return null;
    let petBody: React.ReactNode = null;

    switch (petId) {
      case 'cat':
        petBody = (
          <g>
            <circle cx="22" cy="24" r="7" fill="#f4a261" />
            <polygon points="16,18 20,20 18,14" fill="#e76f51" />
            <polygon points="28,18 24,20 26,14" fill="#e76f51" />
            <circle cx="20" cy="23" r="1" fill="#000" />
            <circle cx="24" cy="23" r="1" fill="#000" />
            <polygon points="21,25 23,25 22,26" fill="#f26419" />
            <ellipse cx="22" cy="34" rx="8" ry="6" fill="#f4a261" />
            <path d="M 28,34 Q 34,36 32,28" fill="none" stroke="#f4a261" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
        break;
      case 'dog':
        petBody = (
          <g>
            <rect x="15" y="18" width="14" height="12" rx="3" fill="#e9c46a" />
            <rect x="12" y="18" width="4" height="8" rx="1" fill="#e76f51" />
            <rect x="28" y="18" width="4" height="8" rx="1" fill="#e76f51" />
            <circle cx="19" cy="22" r="1" fill="#000" />
            <circle cx="25" cy="22" r="1" fill="#000" />
            <ellipse cx="22" cy="25" rx="2" ry="1" fill="#000" />
            <rect x="14" y="28" width="16" height="12" rx="4" fill="#e9c46a" />
            <path d="M 29,32 C 34,32 32,24 33,22" fill="none" stroke="#e9c46a" strokeWidth="2.5" />
          </g>
        );
        break;
      case 'slime':
        petBody = (
          <g>
            <path d="M 12,38 C 12,30 32,30 32,38 C 32,41 30,43 22,43 C 14,43 12,41 12,38 Z" fill="#2a9d8f" opacity="0.85" />
            <ellipse cx="22" cy="39" rx="8" ry="3" fill="#264653" opacity="0.3" />
            <circle cx="18" cy="36" r="1" fill="#fff" />
            <circle cx="26" cy="36" r="1" fill="#fff" />
            <path d="M 21,38 Q 22,39 23,38" fill="none" stroke="#fff" strokeWidth="1" />
          </g>
        );
        break;
      case 'owl':
        petBody = (
          <g>
            <ellipse cx="22" cy="28" rx="10" ry="12" fill="#7f5539" />
            <ellipse cx="22" cy="28" rx="7" ry="9" fill="#ddb892" />
            <circle cx="18" cy="24" r="3.5" fill="#fff" stroke="#9a7b56" strokeWidth="1" />
            <circle cx="18" cy="24" r="1.5" fill="#000" />
            <circle cx="26" cy="24" r="3.5" fill="#fff" stroke="#9a7b56" strokeWidth="1" />
            <circle cx="26" cy="24" r="1.5" fill="#000" />
            <polygon points="21,27 23,27 22,30" fill="#f4a261" />
            <path d="M 11,25 Q 8,30 11,35" fill="none" stroke="#7f5539" strokeWidth="3" strokeLinecap="round" />
            <path d="M 33,25 Q 36,30 33,35" fill="none" stroke="#7f5539" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
        break;
      case 'dragon':
        petBody = (
          <g>
            <ellipse cx="22" cy="24" rx="8" ry="8" fill="#7209b7" />
            <polygon points="16,18 14,12 19,16" fill="#f72585" />
            <polygon points="28,18 30,12 25,16" fill="#f72585" />
            <ellipse cx="19" cy="24" rx="1.5" ry="2" fill="#ffd700" />
            <ellipse cx="25" cy="24" rx="1.5" ry="2" fill="#ffd700" />
            <ellipse cx="22" cy="34" rx="9" ry="8" fill="#7209b7" />
            <path d="M 14,32 C 8,28 10,22 14,24" fill="#f72585" />
            <path d="M 30,32 C 36,28 34,22 30,24" fill="#f72585" />
            <path d="M 28,38 Q 33,40 33,35" fill="none" stroke="#7209b7" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        );
        break;
      default:
        return null;
    }

    return (
      <svg x="22" y="16" width="30" height="30" viewBox="0 0 44 44">
        {petBody}
      </svg>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  // If the character has a custom image (PNG or animated GIF), use an HTML img tag
  // so that GIF animations play natively (SVG <image> does not animate GIFs reliably).
  if (charAsset?.image_url) {
    return (
      <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <img
          src={charAsset.image_url}
          alt="character"
          style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
        />
        {petId && petId !== 'none' && (
          petAsset?.image_url ? (
            <img
              src={petAsset.image_url}
              alt="pet"
              style={{
                position: 'absolute',
                bottom: 0,
                right: -Math.round(size * 0.35),
                width: Math.round(size * 0.5),
                height: Math.round(size * 0.5),
                objectFit: 'contain',
                imageRendering: 'pixelated',
              }}
            />
          ) : (
            <svg
              style={{ position: 'absolute', bottom: 0, right: -Math.round(size * 0.35), width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
              viewBox="0 0 54 54"
              fill="none"
            >
              {getPetSvg()}
            </svg>
          )
        )}
      </div>
    );
  }

  // ─── LEGACY SVG RENDER (for base_1, base_2, base_3 and char_XX PNG sprites) ─
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width="100%" height="100%" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        {base && base.startsWith('char_') ? (
          // Render char_XX.png from /public/assets/sprites/character/
          <image
            href={`/assets/sprites/character/${base}.png`}
            x="4" y="2" width="36" height="42"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <>
            {/* Head */}
            <circle cx="22" cy="18" r="9" fill={getSkinColor()} />
            {/* Cheeks */}
            <circle cx="15" cy="20" r="1.5" fill="#ffb3c1" opacity="0.6" />
            <circle cx="29" cy="20" r="1.5" fill="#ffb3c1" opacity="0.6" />
            {/* Eyes */}
            <rect x="17" y="16" width="2" height="3" rx="0.5" fill="#1a1a24" />
            <rect x="25" y="16" width="2" height="3" rx="0.5" fill="#1a1a24" />
            {/* Mouth */}
            <path d="M 20,22 Q 22,23 24,22" fill="none" stroke="#1a1a24" strokeWidth="1" />
            {/* Outfit */}
            {getOutfitDetails()}
            {/* Hair */}
            {getHairStyles()}
            {/* Accessories */}
            {getAccessory()}
          </>
        )}

        {/* Pet overlay */}
        {petId && petId !== 'none' && (
          petAsset?.image_url ? (
            <image
              href={petAsset.image_url}
              x="22" y="26" width="24" height="24"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            getPetSvg()
          )
        )}
      </svg>
    </div>
  );
};
