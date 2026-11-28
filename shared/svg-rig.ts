import type { MouthShape } from './types';

export const SVG_RIG_VIEWS = ['front', 'three-quarter-left', 'three-quarter-right', 'profile-left', 'profile-right', 'back'] as const;
export type SvgRigViewId = typeof SVG_RIG_VIEWS[number];
export const SVG_RIG_EXPRESSIONS = ['neutral','attentive','focused','thinking','curious','happy','content','excited','delighted','laughing','proud','affectionate','relieved','sad','crying','worried','scared','panicked','embarrassed','shy','disappointed','angry','furious','annoyed','disgusted','determined','suspicious','skeptical','smug','unimpressed','surprised','shocked','confused','sleepy','tired','wink'] as const;
export type SvgRigExpression = typeof SVG_RIG_EXPRESSIONS[number];
export const SVG_RIG_GESTURES = ['wave','point-left','point-right','point-up','point-down','present-left','present-right','explain','shrug','palms-up','stop','beckon','thumbs-up','clap','folded-arms','hands-on-hips','think','hand-to-chest','namaste','salute','nod','shake-head','scratch-head','facepalm'] as const;
export const SVG_RIG_ACTIONS = ['idle','walk','run','tiptoe','turn','sit-down','seated','stand-up','reach','crouch','jump','bow','recoil','celebrate'] as const;
export type SvgRigGesture = typeof SVG_RIG_GESTURES[number];
export type SvgRigAction = typeof SVG_RIG_ACTIONS[number];
export const SVG_RIG_MOUTHS: MouthShape[] = ['A','B','C','D','E','F','G','H','X'];
/** Silent mouth shapes the expressions use; required in every speaking view next to the A–H/X speech shapes. */
export const SVG_RIG_MOUTH_EXTRAS = ['smile','grin','frown','o','smirk'] as const;
/**
 * Conventions (skills/kitta-svg-character/rig-contract.md): a 1000×1000 canvas per view; `body` is the root at the hips;
 * left/right mean screen-left/right as drawn in the front view; positive rotation is clockwise on screen; the parts
 * array order is the draw order. Optional parts the recipes use when present: pupil-*, cheek-* (variant blush),
 * tear-* (variant on); hand-* variants open, fist, point, thumbs-up; eye-* variant closed.
 */
export const SVG_RIG_PARTS = ['body','head','eye-left','eye-right','brow-left','brow-right','mouth','arm-left','arm-right','forearm-left','forearm-right','hand-left','hand-right','leg-left','leg-right','shin-left','shin-right','foot-left','foot-right'] as const;
/** Geometry is declarative. No raw SVG/HTML, images, URLs, CSS or executable code. */
export interface RigShape { kind:'path'|'ellipse'|'rect'; d?:string; x?:number; y?:number; width?:number; height?:number; rx?:number; ry?:number; fill:string; stroke?:string; strokeWidth?:number }
/** Coordinates are local to the parent, rotation is around this part's origin. */
export interface RigPart { id:string; parent:string|null; x:number; y:number; shapes:RigShape[]; variants?:Record<string,RigShape[]>; role?:'torso'|'head'|'upper-arm'|'forearm'|'thigh'|'shin'|'other' }
export interface RigTransform { x?:number; y?:number; rotate?:number; scaleX?:number; scaleY?:number; variant?:string }
export type RigPose = Record<string,RigTransform>;
export interface RigKey extends RigTransform { at:number }
export interface RigClip { durationMs:number; loop:boolean; tracks:{part:string;keys:RigKey[]}[] }
export interface SvgRigView { parts:RigPart[]; expressions:Record<SvgRigExpression,RigPose>; mouthPart:string|null; blink:RigPose; waistY:number; groundY:number }
export interface SvgRigPack {
 version:1; bodyFamily:'human'|'upright-animal';
 views:Record<SvgRigViewId,SvgRigView>;
 gestures:Record<SvgRigGesture,RigClip>;
 actions:Record<SvgRigAction,RigClip>;
}
export const RIG_PROPORTIONS = ['torsoWidth','headScale','armLength','legLength'] as const;
/** Bounded body adjustments (0.8–1.25) a saved character may carry. */
export type RigProportions = Partial<Record<typeof RIG_PROPORTIONS[number], number>>;
/**
 * A library character drawn from a validated pack. `pack` is attached when loaded from the library (never trusted
 * from a browser for export); the browser fetches it by id. Published packs never change, so `{artId}` stays reproducible.
 */
export interface SvgRigCharacter {
 kind:'svg-rig'; id:string; name:string; packVersion:number; pack?:SvgRigPack;
 view?:SvgRigViewId; framing?:'waist'|'full';
 /** Local segment scaling; descendants' joint offsets follow scaled lengths. */
 proportions?:RigProportions;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min=-2000,max=2000)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const paint=(v:unknown)=>typeof v==='string'&&/^(?:#[0-9a-fA-F]{3,8}|none|transparent)$/.test(v);
const TRANSFORM_KEYS=['x','y','rotate','scaleX','scaleY','variant'];
function transformErrors(v:unknown,context:string,parts?:Map<string,RigPart>,part?:string):string[]{
 if(!object(v))return[`${context}: expected transform`];
 const e:string[]=[];
 for(const k of Object.keys(v)){if(!TRANSFORM_KEYS.includes(k)&&k!=='at')e.push(`${context}: unknown transform ${k}`);}
 for(const k of ['x','y','rotate','scaleX','scaleY'])if(v[k]!==undefined&&!finite(v[k],k.startsWith('scale')?.1:-2000,k.startsWith('scale')?4:2000))e.push(`${context}.${k}: finite bounded number required`);
 if(v.variant!==undefined&&(typeof v.variant!=='string'||!v.variant.match(/^[A-Za-z0-9-]{1,64}$/)||parts&&part&&!parts.get(part)?.variants?.[v.variant]))e.push(`${context}: unknown variant ${String(v.variant)}`);
 return e;
}
function shapesErrors(v:unknown,context:string):string[]{
 if(!Array.isArray(v)||v.length>120)return[`${context}: expected at most 120 shapes`];
 const e:string[]=[];
 v.forEach((s,i)=>{
  const c=`${context}[${i}]`;if(!object(s)){e.push(`${c}: expected shape`);return;}
  const allowed=['kind','d','x','y','width','height','rx','ry','fill','stroke','strokeWidth'];
  if(Object.keys(s).some(k=>!allowed.includes(k)))e.push(`${c}: unsupported shape property`);
  if(!['path','ellipse','rect'].includes(String(s.kind)))e.push(`${c}: unsupported shape kind`);
  if(!paint(s.fill)||s.stroke!==undefined&&!paint(s.stroke))e.push(`${c}: unsafe paint`);
  for(const k of ['x','y','width','height','rx','ry','strokeWidth'])if(s[k]!==undefined&&!finite(s[k],['width','height','rx','ry','strokeWidth'].includes(k)?0:-2000,2000))e.push(`${c}.${k}: finite bounded number required`);
  if(s.kind==='path'&&(typeof s.d!=='string'||s.d.length>24000||!s.d.trim()||!/^[MmLlHhVvCcSsQqTtAaZzEe0-9.,+\s-]+$/.test(s.d)))e.push(`${c}: invalid path data`);
  if(s.kind==='ellipse'&&(!finite(s.rx,0,2000)||!finite(s.ry,0,2000)))e.push(`${c}: ellipse requires radii`);
  if(s.kind==='rect'&&(!finite(s.width,0,2000)||!finite(s.height,0,2000)))e.push(`${c}: rect requires dimensions`);
 });return e;
}
function poseErrors(v:unknown,context:string,parts:Map<string,RigPart>):string[]{
 if(!object(v))return[`${context}: expected pose`];
 return Object.entries(v).flatMap(([key,value])=>[...(!parts.has(key)?[`${context}: missing part ${key}`]:[]),...transformErrors(value,`${context}.${key}`,parts,key)]);
}
/** Per-stage validation, also used before accepting a generated view. */
export function validateSvgRigView(value:unknown):string[]{
 if(!object(value))return['view: expected object'];
 if(!Array.isArray(value.parts)||!value.parts.length||value.parts.length>100)return['view.parts: expected 1–100 parts'];
 const e:string[]=[];const parts=new Map<string,RigPart>();
 for(const p of value.parts){
  if(!object(p)||!id(p.id)){e.push('view.parts: invalid part id');continue;}
  if(parts.has(p.id))e.push(`view.parts: duplicate ${p.id}`);
  parts.set(p.id,p as unknown as RigPart);
  if(!finite(p.x)||!finite(p.y))e.push(`${p.id}: finite joint coordinates required`);
  if(p.parent!==null&&!id(p.parent))e.push(`${p.id}: invalid parent`);
  e.push(...shapesErrors(p.shapes,p.id));
  if(p.variants!==undefined){
   if(!object(p.variants)||Object.keys(p.variants).length>64)e.push(`${p.id}: invalid variants`);
   else for(const [k,v] of Object.entries(p.variants)){if(!/^[A-Za-z0-9-]{1,64}$/.test(k))e.push(`${p.id}: invalid variant name`);e.push(...shapesErrors(v,`${p.id}.${k}`));}
  }
 }
 for(const required of SVG_RIG_PARTS)if(!parts.has(required))e.push(`view: missing part ${required}`);
 for(const p of parts.values()){
  let cursor:RigPart|undefined=p;const visited=new Set<string>();
  while(cursor){if(visited.has(cursor.id)){e.push(`${p.id}: parent cycle`);break;}visited.add(cursor.id);if(cursor.parent===null)break;if(!parts.has(cursor.parent)){e.push(`${p.id}: missing parent ${cursor.parent}`);break;}cursor=parts.get(cursor.parent);}
 }
 if(!finite(value.waistY,100,900)||!finite(value.groundY,500,1000)||Number(value.waistY)>=Number(value.groundY))e.push('view: invalid waist/ground bounds');
 if(!object(value.expressions))e.push('view: missing expressions');
 else for(const expression of SVG_RIG_EXPRESSIONS)e.push(...poseErrors(value.expressions[expression],`expression ${expression}`,parts));
 e.push(...poseErrors(value.blink,'blink',parts));
 if(value.mouthPart!==null){
  if(typeof value.mouthPart!=='string'||!parts.has(value.mouthPart))e.push('view: missing mouth part');
  else for(const shape of [...SVG_RIG_MOUTHS,...SVG_RIG_MOUTH_EXTRAS])if(!parts.get(value.mouthPart)?.variants?.[shape])e.push(`mouth: missing ${shape}`);
 }
 return e;
}
export function validateRigClip(value:unknown,partIds?:Iterable<string>):string[]{
 if(!object(value))return['clip: expected object'];
 const e:string[]=[];const parts=partIds?new Set(partIds):undefined;
 if(!finite(value.durationMs,100,30000)||typeof value.loop!=='boolean')e.push('clip: durationMs 100–30000 and loop boolean required');
 if(!Array.isArray(value.tracks)||value.tracks.length>100)return[...e,'clip: expected tracks'];
 const seen=new Set<string>();
 for(const t of value.tracks){
  if(!object(t)||!id(t.part)){e.push('clip: invalid track');continue;}
  if(seen.has(t.part))e.push(`clip: duplicate track ${t.part}`);seen.add(t.part);
  if(parts&&!parts.has(t.part))e.push(`clip: missing part ${t.part}`);
  if(!Array.isArray(t.keys)||t.keys.length<2||t.keys.length>48){e.push(`clip ${t.part}: expected 2–48 keys`);continue;}
  let previous=-1;
  for(const k of t.keys){if(!object(k)||!finite(k.at,0,1)||Number(k.at)<=previous){e.push(`clip ${t.part}: keys must increase from 0 to 1`);continue;}previous=Number(k.at);e.push(...transformErrors(k,`clip ${t.part}`));}
  if(t.keys[0]?.at!==0||t.keys.at(-1)?.at!==1)e.push(`clip ${t.part}: endpoints 0 and 1 required`);
 }
 return e;
}
export function validateSvgRigPack(value:unknown):string[]{
 if(!object(value))return['pack: expected object'];
 const e:string[]=[];
 if(value.version!==1||!['human','upright-animal'].includes(String(value.bodyFamily)))e.push('pack: unsupported version or body family');
 if(!object(value.views))return[...e,'pack: missing views'];
 const viewMaps:Map<string,RigPart>[]=[];
 for(const view of SVG_RIG_VIEWS){
  const v=value.views[view];e.push(...validateSvgRigView(v).map(x=>`${view}: ${x}`));
  if(object(v)&&Array.isArray(v.parts))viewMaps.push(new Map(v.parts.filter(p=>object(p)&&id(p.id)).map(p=>[p.id,p as unknown as RigPart])));
  if(object(v)&&view!=='back'&&v.mouthPart===null)e.push(`${view}: speaking view requires a mouth`);
 }
 for(const [group,catalog] of [['gestures',SVG_RIG_GESTURES],['actions',SVG_RIG_ACTIONS]] as const){
  const clips=value[group];if(!object(clips)){e.push(`pack: missing ${group}`);continue;}
  for(const name of catalog){
   const c=clips[name];e.push(...validateRigClip(c,viewMaps[0]?.keys()).map(x=>`${group}.${name}: ${x}`));
   if(object(c)&&Array.isArray(c.tracks))for(const t of c.tracks)if(object(t)&&typeof t.part==='string')for(const parts of viewMaps){
    if(!parts.has(t.part))e.push(`${group}.${name}: missing part ${t.part} in a view`);
    if(Array.isArray(t.keys))for(const k of t.keys)e.push(...transformErrors(k,`${group}.${name}`,parts,t.part));
   }
  }
 }
 // A bounded serialized size prevents huge generated documents from blocking UI/export.
 try{if(JSON.stringify(value).length>3_000_000)e.push('pack: exceeds 3 MB limit');}catch{e.push('pack: not serializable');}
 return e;
}
export type RigOptions = Pick<SvgRigCharacter,'view'|'framing'|'proportions'>;
/** The per-use options of a rig character, from untrusted input: unknown keys dropped, proportions clamped to 0.8–1.25. */
export function rigOptions(v:unknown):RigOptions{
 if(!object(v))return{};
 const out:RigOptions={};
 if((SVG_RIG_VIEWS as readonly unknown[]).includes(v.view))out.view=v.view as SvgRigViewId;
 if(v.framing==='full'||v.framing==='waist')out.framing=v.framing;
 if(object(v.proportions)){
  const p:RigProportions={};
  for(const k of RIG_PROPORTIONS){const n=v.proportions[k];if(typeof n==='number'&&Number.isFinite(n)&&n!==1)p[k]=Math.min(1.25,Math.max(0.8,n));}
  if(Object.keys(p).length)out.proportions=p;
 }
 return out;
}
