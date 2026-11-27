// Two steps into the shot. Foot positions are in scene space until converted
// to hip-relative coordinates, keeping the support foot on the same pixel.
const phase = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
export function entrancePose(ms: number, walking: boolean) {
  const step = (start: number) => walking ? phase((ms - start) / 650) : 1;
  const right = step(120), left = step(770);
  const root = 78 * (ease(right) + ease(left) - 2);
  const foot = (p: number) => ({
    x: 156 * (ease(p) - 1) - root,
    lift: 47 * Math.sin(Math.PI * p) ** 2,
  });
  return { root, right: foot(right), left: foot(left),
    swing: 17 * (Math.sin(Math.PI * right) - Math.sin(Math.PI * left)),
    bounce: -8 * (Math.sin(Math.PI * right) ** 2 + Math.sin(Math.PI * left) ** 2) };
}

// Ease into whole strides so a resized clip always ends in the resting pose.
export function walkingPose(progress: number, durationMs: number) {
  const cycles = Math.max(1, Math.round(durationMs / 1050));
  const angle = progress * cycles * Math.PI * 2;
  const weight = ease(phase(Math.min(progress, 1 - progress) * cycles * 8));
  const swing = Math.sin(angle) * weight;
  const foot = (dir: number) => ({ x: dir * swing * 54,
    lift: Math.max(0, dir * Math.cos(angle)) * weight * 62 });
  return { root: 0, swing: 22 * swing, bounce: -7 * weight * Math.sin(angle) ** 2,
    right: foot(1), left: foot(-1) };
}

export function Legs({ pose, upperY, fur }: { pose: ReturnType<typeof entrancePose>; upperY: number; fur?: string }) {
  return <g data-part="legs" strokeLinejoin="round">
    {(['left', 'right'] as const).map(side => {
      const dir = side === 'left' ? -1 : 1;
      const hip = 500 + dir * 70;
      const ankle = hip + dir * 24 + pose[side].x;
      const y = 1460 - pose[side].lift;
      const hipY = 997 + upperY;
      const knee = (hip + ankle) / 2 + pose[side].lift * .65;
      const kneeY = (hipY + y) / 2;
      return <g key={side} data-part={side + '-leg'}>
        <path fill={fur ?? (dir < 0 ? '#373842' : '#464653')} stroke="#261f29" strokeWidth="7"
          d={`M${hip-68} ${hipY} Q${hip-62} ${hipY+100} ${knee-41} ${kneeY} L${ankle-32} ${y} Q${ankle} ${y+12} ${ankle+32} ${y} L${knee+43} ${kneeY+6} Q${hip+70} ${hipY+60} ${hip+68} ${hipY}Z`}/>
        <g transform={`translate(${ankle} ${y})`}>
          {fur ? <path fill={fur} stroke="#312329" strokeWidth="6" d="M-31 -20 Q-43 -8 -44 10 Q-47 29 -26 28 Q-14 37 3 30 Q17 35 30 27 Q53 27 47 10 Q41 -9 26 -19Z"/> : <><path fill="#392d30" stroke="#241c22" strokeWidth="7" d="M-33 -30 Q-4 -21 29 -31 L33 -1 Q61 7 63 24 Q31 34 -37 25Z"/>
          <path fill="none" stroke="#d9af68" strokeWidth="5" d="M-34 19 Q9 25 57 19 M12 -9 l17 -3"/></>}
        </g>
      </g>;
    })}
  </g>;
}
