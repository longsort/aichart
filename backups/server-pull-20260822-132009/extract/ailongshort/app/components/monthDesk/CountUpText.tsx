'use client';

import { useCountUp, formatCountUp } from './useCountUp';

export default function CountUpText({
  value,
  decimals = 0,
  suffix = '',
  className,
  style,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const n = useCountUp(value);
  return (
    <span className={className} style={style}>
      {formatCountUp(n, decimals)}
      {suffix}
    </span>
  );
}
