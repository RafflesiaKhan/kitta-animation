import type { CharacterConfig, StarterId } from '../types';

export type CastId = 'kai' | 'ira' | 'rohan' | 'baba' | 'mochi';
export function isCast(id: StarterId): id is CastId {
  return id === 'kai' || id === 'ira' || id === 'rohan' || id === 'baba' || id === 'mochi';
}

const ink = '#241b23';
const cream = '#ffebca';

// Local coordinates span -100..100 around the face. Facial controls are drawn
// above this layer so the same artwork follows dialogue, blinks and head turns.
export function CastHead({ config }: { config: CharacterConfig }) {
  const { starter, hairColor, skin } = config;
  const cat = starter === 'mochi';
  const face = cat
    ? 'M-96 -5 Q-98 -64 -80 -112 Q-72 -122 -45 -79 Q-5 -89 29 -76 Q60 -120 70 -108 L82 -40 Q95 -25 102 -12 L95 -10 L103 1 L94 2 Q86 70 10 87 Q-54 99 -96 54 L-107 48 L-97 43 L-110 37 Q-101 24 -96 -5Z'
    : 'M-91 -28 Q-98 -85 -30 -95 Q46 -111 77 -67 Q97 -45 91 -13 Q92 6 99 24 Q104 49 80 68 Q54 94 10 96 Q-48 100 -75 61 Q-94 62 -103 46 Q-117 21 -97 15 L-88 15Z';
  return <g stroke={ink} strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round">
    {starter === 'ira' && <path fill={hairColor} d="M-49 -64 Q-74 -143 -139 -128 Q-116 -124 -109 -104 Q-144 -115 -158 -77 Q-140 -91 -123 -84 Q-153 -65 -142 -26 Q-133 -48 -118 -52 Q-129 -20 -108 -5 Q-105 -46 -67 -49Z"/>}
    {starter === 'baba' && <path fill={hairColor} d="M-74 -73 C-94 -121 -122 -114 -126 -100 C-154 -107 -167 -84 -155 -71 C-181 -58 -163 -35 -153 -35 C-161 -10 -125 -7 -119 -17 Q-88 -6 -72 -40Z"/>}
    <path data-part="head" fill={skin} d={face}/>
    {cat ? <g stroke="none">
      <path fill="#e99879" d="M-82 -101 L-54 -76 L-84 -51Z M62 -98 L69 -53 L41 -73Z"/>
      <path fill={cream} d="M-95 42 Q-69 1 -22 28 Q13 6 36 19 Q68 12 94 0 Q92 64 15 84 Q-51 97 -95 42Z"/>
      <path fill="#ce791d" d="M-95 9 L-71 17 L-94 21Z"/>
      <path fill={ink} d="M-7 25 Q2 22 11 25 L3 33Z"/>
    </g> : <g>
      <path fill="none" stroke="#ae684c" strokeWidth={2} d="M-99 29 Q-86 22 -83 41 M11 23 Q22 35 12 37"/>
      <path fill="#a1533d" opacity=".17" stroke="none" d="M-74 55 Q-29 109 54 81 Q-26 124 -74 55Z"/>
    </g>}
    {starter === 'kai' && <g transform="translate(-60 52) rotate(32)"><rect x="-8" y="-12" width="16" height="24" rx="2" fill={cream} strokeWidth="1.7"/><path stroke="#bb936f" strokeWidth="1.5" d="M-4 -5h2 M1 5h2"/></g>}
    {starter === 'rohan' && <g fill="#ad734f" stroke="none">{[-63,-55,-48,55,63,70].map((x,i)=><circle key={x} cx={x} cy={41+i%3*3} r="1.5"/>)}</g>}
    {starter === 'ira' && [-89,84].map(x=><ellipse key={x} cx={x} cy="53" rx="7" ry="11" fill="none" stroke="#e4a320" strokeWidth="4"/>)}
    {starter === 'baba' && <path fill={hairColor} d="M-85 26 Q-76 58 -48 51 Q-22 64 9 55 Q48 61 70 47 Q90 47 91 25 Q114 44 100 68 L105 65 Q89 103 51 101 L55 105 Q-18 120 -59 91 L-57 97 Q-91 83 -85 26Z"/>}
  </g>;
}

const hairShapes = {
  kai: 'M-86 29 L-102 9 L-91 -15 L-119 -6 Q-113 -29 -90 -45 L-124 -37 Q-110 -67 -77 -71 L-96 -99 L-64 -83 Q-63 -118 -32 -136 Q-44 -109 -36 -97 Q-12 -135 29 -144 L10 -111 Q59 -131 93 -110 Q57 -110 45 -98 Q93 -98 111 -60 L86 -70 Q110 -43 102 -13 L76 -46 L72 -31 L45 -65 L42 -46 L21 -69 L11 -52 L-5 -78 L-48 -66 L-58 -36 L-69 -42Z',
  ira: 'M-86 23 Q-110 -21 -81 -71 Q-57 -115 -9 -99 Q19 -131 53 -116 Q33 -110 26 -96 Q76 -95 93 -47 L82 -50 L97 -19 Q83 -24 67 -49 Q38 -66 28 -81 Q-6 -56 -46 -57 Q-75 -26 -64 13 L-55 54 Q-80 38 -85 0Z',
  rohan: 'M-87 35 Q-111 36 -106 14 Q-129 13 -115 -14 Q-137 -24 -115 -45 Q-131 -64 -100 -73 Q-123 -88 -90 -93 Q-97 -114 -75 -110 Q-77 -138 -49 -124 Q-33 -143 -20 -123 Q-4 -146 14 -132 Q46 -145 39 -122 Q78 -129 74 -104 Q108 -103 95 -78 Q120 -64 100 -47 Q110 -29 91 -16 Q78 -27 80 -47 Q58 -40 55 -64 Q39 -52 33 -73 Q12 -52 3 -66 Q-15 -40 -33 -50 Q-33 -22 -55 -29 Q-52 1 -71 -2Z',
  baba: 'M-95 24 Q-114 -7 -101 -40 Q-108 -60 -87 -69 Q-92 -90 -71 -92 Q-60 -113 -43 -101 Q-21 -118 -6 -105 Q16 -118 32 -103 Q63 -111 72 -91 Q97 -83 88 -59 Q70 -73 48 -65 Q34 -79 14 -69 Q-9 -78 -22 -65 Q-44 -73 -53 -53 Q-76 -46 -79 -12Z',
};

export function CastHair({ config }: { config: CharacterConfig }) {
  const id = config.starter;
  if (!isCast(id)) return null;
  if (id === 'mochi') return <path data-part="hair" fill={config.hairColor} d="M-32 -77 L-13 -58 L-17 -80Z M-5 -81 L12 -61 L11 -80Z"/>;
  return <g data-part="hair" stroke={ink} strokeWidth="3.4" strokeLinejoin="round">
    <path fill={config.hairColor} d={hairShapes[id]}/>
    <path fill="#fff" opacity=".17" stroke="none" d={id === 'kai' ? 'M-34 -106 Q-8 -132 15 -137 Q-14 -118 -34 -97Z M22 -108 Q57 -124 82 -113 Q48 -115 22 -101Z' : 'M-88 -65 Q-69 -98 -39 -93 Q-71 -80 -88 -51Z M9 -92 Q36 -107 53 -96 Q32 -96 9 -83Z'}/>
    {id === 'ira' && <g transform="rotate(-9)">
      <path fill="none" strokeWidth="7" d="M-91 -17 Q-88 -86 -35 -91 Q24 -109 82 -65"/>
      {[-38,19].map(x=><g key={x} transform={`translate(${x} -91)`}><ellipse rx="25" ry="13" fill="#44434b"/><ellipse rx="20" ry="9" fill="#87c8d7" strokeWidth="1.7"/><path d="M-10 5 L2 -7 L9 -7 L-3 6Z" stroke="none" fill="#faf6ed"/></g>)}
    </g>}
  </g>;
}

export function CastCostume({ id }: { id: CastId }) {
  return <g stroke={ink} strokeLinejoin="round" strokeWidth="5">
    {(id === 'kai' || id === 'rohan') && <g>
      <path fill="#000" opacity=".16" stroke="none" d="M362 711 Q398 761 483 779 L447 815 Q396 780 362 711Z M639 710 Q610 760 517 781 L546 801 Q610 781 639 710Z M336 947 Q365 978 409 979 L381 989 Q356 984 336 969Z"/>
      <path fill="none" strokeWidth="6" d="M370 701 Q412 749 493 772 M628 702 Q586 751 511 772"/>
      <path fill="none" stroke="#eee3ca" strokeWidth="6" d="M475 769 L465 850 M525 769 L532 843"/>
    </g>}
    {id === 'ira' && <path fill="#edb537" d="M320 725 L352 697 L385 734 L370 754Z M680 725 L647 697 L616 734 L631 754Z M364 822h12v68h-12Z M620 822h12v68h-12Z"/>}
    {id === 'baba' && <g><path d="M373 713 Q478 800 629 710" stroke="#37353b" strokeWidth="25" fill="none"/>{[389,611].map(x=><g key={x}><ellipse cx={x} cy="738" rx="32" ry="42" fill="#45444b"/><ellipse cx={x} cy="738" rx="21" ry="30" fill="#939399"/></g>)}<path transform="translate(461 847) scale(7)" stroke="none" fill="#e9cf98" d="M2 0h1v1H2z M8 0h1v1H8z M3 1h5v1H3z M2 2h7v1H2z M1 3h2v1H1z M4 3h3v1H4z M8 3h2v1H8z M0 4h11v2H0z M1 6h1v1H1z M9 6h1v1H9z"/></g>}
    {id === 'mochi' && <g><path fill={cream} stroke="none" d="M455 712 Q498 688 549 712 Q633 862 593 994 L412 994 Q379 865 455 712Z"/><path fill="#cd4339" d="M362 688 Q501 750 640 684 L634 713 Q496 772 369 716Z"/><circle cx="509" cy="751" r="26" fill="#ffc236"/><path d="M488 747 Q508 735 530 744 M510 758v15" fill="none"/></g>}
  </g>;
}
