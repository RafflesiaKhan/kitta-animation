import { describe, it, expect } from 'vitest';
import { checkVector } from '../../shared/vector-avator/check';
import sample from '../../shared/vector-avator/sample/usagi.vector.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const broken = (edit: (d: any) => void) => {
  const d = structuredClone(sample);
  edit(d);
  return checkVector(d);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const part = (d: { parts: any[] }, id: string) => d.parts.find((p) => p.id === id)!;

describe('checkVector', () => {
  it('passes the bundled sample with no errors or warnings', () => {
    expect(checkVector(sample)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects a non-object', () => {
    expect(checkVector(null).errors).toEqual(['vector.json must be an object']);
  });

  it('reports a missing required part and a missing group', () => {
    const r = broken((d) => { d.parts = d.parts.filter((p: { group?: string }) => p.group !== 'mouth'); });
    expect(r.errors).toContain('missing required part: mouth_a');
    expect(r.errors).toContain('missing group mouth');
  });

  it('reports a path the renderer cannot parse', () => {
    const r = broken((d) => { part(d, 'nose').shapes[0].d = 'M 0 0 A 1 1 0 0 1 5 5 Z'; });
    expect(r.errors.some((e) => e.startsWith('nose: cannot parse path'))).toBe(true);
  });

  it('reports strokes, bad colours and unknown bones', () => {
    const r = broken((d) => {
      const n = part(d, 'nose');
      n.shapes[0].stroke = '#000000';
      n.shapes[0].fill = 'red';
      n.bone = 'tailbone';
    });
    expect(r.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/^nose\/.*stroke is not allowed/),
      expect.stringMatching(/^nose\/.*bad fill color/),
      'nose: bone "tailbone" is neither a skeleton bone nor a chain id',
    ]));
  });

  it('reports a group with two visible variants', () => {
    const r = broken((d) => { for (const p of d.parts) if (p.group === 'mouth') p.visible = true; });
    expect(r.errors.some((e) => e.startsWith('group mouth: the visible parts must make up exactly one variant'))).toBe(true);
  });

  it('reports swapped shoulders and skeleton points off the picture', () => {
    const r = broken((d) => {
      [d.skeleton.shoulder_L, d.skeleton.shoulder_R] = [d.skeleton.shoulder_R, d.skeleton.shoulder_L];
      d.skeleton.ankle_L = [500, 1700];
    });
    expect(r.errors).toContain("skeleton: shoulder_L must be on the screen right (character's own left)");
    expect(r.errors).toContain('skeleton.ankle_L [500,1700] is off the 1024x1536 picture');
  });

  it('reports a part drawn on the wrong side', () => {
    const r = broken((d) => { part(d, 'leg_L').id = 'leg_R_x'; part(d, 'leg_R').id = 'leg_L'; });
    expect(r.errors.some((e) => e.startsWith('leg_L: is on the wrong side'))).toBe(true);
  });

  it('reports an expression that names a missing variant', () => {
    const r = broken((d) => { d.expressions.smile.mouth = 'grin'; });
    expect(r.errors).toContain('expressions.smile.mouth=grin: group mouth has no such variant');
  });

  it('reports out-of-range head-turn and chain values', () => {
    const r = broken((d) => { d.headTurn = { radius: 9, wobble: 1 }; d.chains[0].stiffness = 2; });
    expect(r.errors).toEqual(expect.arrayContaining([
      'headTurn.radius must be a number in 0.5..2.5',
      expect.stringMatching(/^headTurn\.wobble: unknown key/),
      `chain ${sample.chains[0].id}: stiffness must be 0..1`,
    ]));
  });
});
