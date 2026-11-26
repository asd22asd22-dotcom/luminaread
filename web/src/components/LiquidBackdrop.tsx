import React from 'react';

interface Props {
  theme: 'dark' | 'light';
}

export const LiquidBackdrop: React.FC<Props> = ({ theme }) => {
  const isDark = theme === 'dark';

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden z-0 transition-colors duration-500"
      style={{
        background: isDark
          ? 'radial-gradient(circle at 18% 12%, #0c1733 0%, #060914 60%, #04060d 100%)'
          : 'radial-gradient(circle at 18% 12%, #dbeafe 0%, #eef4ff 55%, #f5f3ff 100%)',
      }}
      aria-hidden="true"
    >
      {/* Fluid Iridescent Orbs */}
      <div
        className="orb-1 absolute -top-28 -left-24 w-[44vw] h-[44vw] max-w-[680px] max-h-[680px] rounded-full blur-[110px]"
        style={{
          opacity: 'var(--orb-opacity)',
          background: isDark
            ? 'radial-gradient(circle, rgba(34, 211, 238, 0.48) 0%, rgba(56, 189, 248, 0.14) 60%, transparent 100%)'
            : 'radial-gradient(circle, rgba(56, 189, 248, 0.42) 0%, rgba(125, 211, 252, 0.15) 65%, transparent 100%)',
        }}
      />
      <div
        className="orb-2 absolute top-[22%] -right-24 w-[42vw] h-[42vw] max-w-[640px] max-h-[640px] rounded-full blur-[120px]"
        style={{
          opacity: 'var(--orb-opacity)',
          background: isDark
            ? 'radial-gradient(circle, rgba(167, 139, 250, 0.45) 0%, rgba(232, 121, 249, 0.18) 60%, transparent 100%)'
            : 'radial-gradient(circle, rgba(167, 139, 250, 0.34) 0%, rgba(244, 114, 182, 0.18) 65%, transparent 100%)',
        }}
      />
      <div
        className="orb-3 absolute -bottom-32 left-[28%] w-[46vw] h-[38vw] max-w-[700px] max-h-[560px] rounded-full blur-[125px]"
        style={{
          opacity: isDark ? 0.36 : 0.3,
          background: isDark
            ? 'radial-gradient(circle, rgba(52, 211, 153, 0.25) 0%, rgba(245, 158, 11, 0.14) 55%, transparent 100%)'
            : 'radial-gradient(circle, rgba(94, 234, 212, 0.35) 0%, rgba(253, 186, 116, 0.2) 60%, transparent 100%)',
        }}
      />

      {/* Specular diagonal light sheen */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? 'linear-gradient(125deg, rgba(255,255,255,0.03) 0%, transparent 38%, rgba(34,211,238,0.02) 72%, transparent 100%)'
            : 'linear-gradient(125deg, rgba(255,255,255,0.4) 0%, transparent 45%, rgba(167,139,250,0.08) 80%, transparent 100%)',
        }}
      />
    </div>
  );
};
