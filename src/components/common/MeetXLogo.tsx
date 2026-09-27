import React from 'react';

interface MeetXLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLines?: boolean;
  statusText?: string;
  theme?: 'dark' | 'light';
  animated?: boolean;
}

export const MeetXLogo: React.FC<MeetXLogoProps> = ({
  size = 'md',
  showLines = false,
  statusText,
  theme = 'dark',
  animated = true,
}) => {
  const fontSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl sm:text-7xl',
  };

  const textColor = theme === 'dark' ? 'text-white' : 'text-slate-900';

  return (
    <div className="flex flex-col items-center select-none">
      {/* Brand Name: Meet in white/dark, X in blue */}
      <div className={`font-bold tracking-tight ${fontSizes[size]} flex items-center`}>
        <span className={textColor}>Meet</span>
        <span className="text-blue-500">X</span>
      </div>

      {/* Flowing equalizer lines / sound bars */}
      {showLines && (
        <div className="flex flex-col items-center mt-3">
          <div className="flex items-center gap-1.5 h-6">
            <span
              className={`w-1 rounded-full bg-teal-400 ${
                animated ? 'animate-[pulse_1.2s_ease-in-out_infinite]' : ''
              } h-5`}
            />
            <span
              className={`w-1 rounded-full bg-blue-500 ${
                animated ? 'animate-[pulse_1.5s_ease-in-out_0.2s_infinite]' : ''
              } h-3.5`}
            />
            <span
              className={`w-1 rounded-full bg-blue-400 ${
                animated ? 'animate-[pulse_1.1s_ease-in-out_0.4s_infinite]' : ''
              } h-2`}
            />
            <span
              className={`w-1 rounded-full bg-emerald-400 ${
                animated ? 'animate-[pulse_1.4s_ease-in-out_0.3s_infinite]' : ''
              } h-2`}
            />
          </div>

          {statusText && (
            <span className="text-xs text-slate-400 font-medium tracking-wide mt-2">
              {statusText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
