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

export const SpriteRenderer: React.FC<SpriteProps> = ({
  base,
  hair,
  outfit,
  accessory,
  petId = 'none',
  size = 48,
  className = ''
}) => {
  // Color mappings
  const getSkinColor = () => {
    switch (base) {
      case 'base_2': return '#fcd5b5';
      case 'base_3': return '#d2b48c';
      case 'base_1':
      default: return '#ffe0bd';
    }
  };

  const getHairStyles = () => {
    // Returns paths for hair shapes and colors
    let color = '#3a2e2b'; // Dark brown default
    if (hair.includes('red')) color = '#d90429';
    else if (hair.includes('yellow')) color = '#ffb703';
    else if (hair.includes('grey')) color = '#8d99ae';
    else if (hair.includes('black')) color = '#1a1a24';
    else if (hair.includes('brown')) color = '#7f5539';

    // Different shapes based on hair style name
    const isSpike = hair.includes('spike') || hair.includes('gold') || hair.includes('red');
    const isBob = hair.includes('bob') || hair.includes('brown') || hair.includes('yellow');
    
    if (isSpike) {
      return (
        <path d="M 12,6 L 16,3 L 20,6 L 24,3 L 28,6 L 32,8 L 32,15 L 12,15 Z M 10,9 L 12,6 L 12,15 L 10,13 Z" fill={color} />
      );
    } else if (isBob) {
      return (
        <path d="M 10,9 C 10,4 34,4 34,9 L 34,22 L 30,22 L 30,16 L 14,16 L 14,22 L 10,22 Z" fill={color} />
      );
    } else {
      // Standard haircut
      return (
        <path d="M 12,10 C 12,5 32,5 32,10 L 32,16 L 28,16 L 28,12 L 16,12 L 16,16 L 12,16 Z" fill={color} />
      );
    }
  };

  const getOutfitDetails = () => {
    let color = '#4ea8de'; // default light blue
    let logoColor = '#fff';

    if (outfit.includes('gold')) {
      color = '#ffd700';
      logoColor = '#d90429';
    } else if (outfit.includes('blue')) {
      color = '#1d3557';
      logoColor = '#a8dadc';
    } else if (outfit.includes('green')) {
      color = '#2a9d8f';
      logoColor = '#e9c46a';
    } else if (outfit.includes('red')) {
      color = '#e63946';
      logoColor = '#f1faee';
    } else if (outfit.includes('purple')) {
      color = '#7209b7';
      logoColor = '#f72585';
    } else if (outfit.includes('casual')) {
      color = '#e76f51';
      logoColor = '#264653';
    }

    return (
      <>
        {/* Body Cloak/Shirt */}
        <path d="M 14,28 L 30,28 L 32,42 L 12,42 Z" fill={color} />
        {/* Collar/Sleeve detail */}
        <rect x="18" y="28" width="8" height="3" fill={logoColor} />
        {/* Hands */}
        <circle cx="10" cy="33" r="3" fill={getSkinColor()} />
        <circle cx="34" cy="33" r="3" fill={getSkinColor()} />
      </>
    );
  };

  const getAccessory = () => {
    switch (accessory) {
      case 'crown':
        return (
          // Gold crown with red jewel
          <path d="M 16,5 L 18,1 L 22,5 L 26,1 L 30,5 L 32,9 L 12,9 Z" fill="#ffd700" stroke="#b58a00" strokeWidth="1" />
        );
      case 'glasses':
        return (
          // Cool specs
          <g stroke="#000" strokeWidth="2" fill="none">
            <rect x="14" y="16" width="6" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
            <rect x="24" y="16" width="6" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
            <line x1="20" y1="18" x2="24" y2="18" />
          </g>
        );
      case 'headset':
        return (
          // Red gamer headset
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

  const getPet = () => {
    if (!petId || petId === 'none') return null;

    let petBody = null;
    switch (petId) {
      case 'cat':
        petBody = (
          <g>
            {/* Orange cat */}
            <circle cx="22" cy="24" r="7" fill="#f4a261" />
            {/* Ears */}
            <polygon points="16,18 20,20 18,14" fill="#e76f51" />
            <polygon points="28,18 24,20 26,14" fill="#e76f51" />
            {/* Face details */}
            <circle cx="20" cy="23" r="1" fill="#000" />
            <circle cx="24" cy="23" r="1" fill="#000" />
            <polygon points="21,25 23,25 22,26" fill="#f26419" />
            {/* Body */}
            <ellipse cx="22" cy="34" rx="8" ry="6" fill="#f4a261" />
            {/* Tail */}
            <path d="M 28,34 Q 34,36 32,28" fill="none" stroke="#f4a261" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
        break;
      case 'dog':
        petBody = (
          <g>
            {/* Golden dog */}
            <rect x="15" y="18" width="14" height="12" rx="3" fill="#e9c46a" />
            {/* Floppy Ears */}
            <rect x="12" y="18" width="4" height="8" rx="1" fill="#e76f51" />
            <rect x="28" y="18" width="4" height="8" rx="1" fill="#e76f51" />
            {/* Face */}
            <circle cx="19" cy="22" r="1" fill="#000" />
            <circle cx="25" cy="22" r="1" fill="#000" />
            <ellipse cx="22" cy="25" rx="2" ry="1" fill="#000" />
            {/* Body */}
            <rect x="14" y="28" width="16" height="12" rx="4" fill="#e9c46a" />
            {/* Tail */}
            <path d="M 29,32 C 34,32 32,24 33,22" fill="none" stroke="#e9c46a" strokeWidth="2.5" />
          </g>
        );
        break;
      case 'slime':
        petBody = (
          <g>
            {/* Cute bouncy blue slime */}
            <path d="M 12,38 C 12,30 32,30 32,38 C 32,41 30,43 22,43 C 14,43 12,41 12,38 Z" fill="#2a9d8f" opacity="0.85" />
            <ellipse cx="22" cy="39" rx="8" ry="3" fill="#264653" opacity="0.3" />
            {/* Face */}
            <circle cx="18" cy="36" r="1" fill="#fff" />
            <circle cx="26" cy="36" r="1" fill="#fff" />
            <path d="M 21,38 Q 22,39 23,38" fill="none" stroke="#fff" strokeWidth="1" />
          </g>
        );
        break;
      case 'owl':
        petBody = (
          <g>
            {/* Wise brown owl */}
            <ellipse cx="22" cy="28" rx="10" ry="12" fill="#7f5539" />
            <ellipse cx="22" cy="28" rx="7" ry="9" fill="#ddb892" />
            {/* Huge eyes */}
            <circle cx="18" cy="24" r="3.5" fill="#fff" stroke="#9a7b56" strokeWidth="1" />
            <circle cx="18" cy="24" r="1.5" fill="#000" />
            <circle cx="26" cy="24" r="3.5" fill="#fff" stroke="#9a7b56" strokeWidth="1" />
            <circle cx="26" cy="24" r="1.5" fill="#000" />
            {/* Beak */}
            <polygon points="21,27 23,27 22,30" fill="#f4a261" />
            {/* Wings */}
            <path d="M 11,25 Q 8,30 11,35" fill="none" stroke="#7f5539" strokeWidth="3" strokeLinecap="round" />
            <path d="M 33,25 Q 36,30 33,35" fill="none" stroke="#7f5539" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
        break;
      case 'dragon':
        petBody = (
          <g>
            {/* Purple tiny dragon */}
            <ellipse cx="22" cy="24" rx="8" ry="8" fill="#7209b7" />
            {/* Horns */}
            <polygon points="16,18 14,12 19,16" fill="#f72585" />
            <polygon points="28,18 30,12 25,16" fill="#f72585" />
            {/* Eyes */}
            <ellipse cx="19" cy="24" rx="1.5" ry="2" fill="#ffd700" />
            <ellipse cx="25" cy="24" rx="1.5" ry="2" fill="#ffd700" />
            {/* Body */}
            <ellipse cx="22" cy="34" rx="9" ry="8" fill="#7209b7" />
            {/* Wings */}
            <path d="M 14,32 C 8,28 10,22 14,24" fill="#f72585" />
            <path d="M 30,32 C 36,28 34,22 30,24" fill="#f72585" />
            {/* Tail */}
            <path d="M 28,38 Q 33,40 33,35" fill="none" stroke="#7209b7" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        );
        break;
      default:
        return null;
    }

    return (
      // Placed slightly to the bottom-right of the player
      <svg x="22" y="16" width="30" height="30" viewBox="0 0 44 44">
        {petBody}
      </svg>
    );
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width="100%" height="100%" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Character Base (Skin and Face) */}
        {/* Head */}
        <circle cx="22" cy="18" r="9" fill={getSkinColor()} />
        {/* Cheeks blush */}
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

        {/* Pet (embedded SVG) */}
        {getPet()}
      </svg>
    </div>
  );
};
