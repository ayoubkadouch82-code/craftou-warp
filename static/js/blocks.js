/**
 * CRAFT WARP — block catalog.
 *
 * Opcodes, field names and input names are the exact Scratch 3 ones, so any
 * imported .sb3 keeps working and anything we export opens in Scratch/TurboWarp.
 *
 * parts DSL:
 *   'literal text'      literal label
 *   N('STEPS', '10')    numeric oval input
 *   S('MESSAGE','!')    text oval input
 *   B('CONDITION')      boolean slot
 *   SUB / SUB2          C-block substacks
 *   F('STYLE', opts, v) dropdown field
 *   V('VARIABLE')       variable dropdown
 *   L('LIST')           list dropdown
 *   M('TO', 'sprites', '_random_')  menu (stored as a field, exported as a shadow menu block)
 *   C('COLOR', '#ff0000') colour swatch
 */

const N = (i, v = '10') => ({ i, k: 'number', v });
const S = (i, v = 'hello') => ({ i, k: 'text', v });
const B = (i) => ({ i, k: 'boolean' });
const SUB = { i: 'SUBSTACK', k: 'stack' };
const SUB2 = { i: 'SUBSTACK2', k: 'stack' };
const F = (f, opts, v) => ({ f, k: 'dropdown', opts, v });
const M = (i, menu, v) => ({ i, k: 'menu', menu, v });
const V = (f = 'VARIABLE') => ({ f, k: 'var' });
const L = (f = 'LIST') => ({ f, k: 'list' });
const C = (f, v = '#4c97ff') => ({ f, k: 'color', v });

export const CATEGORIES = [
  { id: 'motion', color: '#4c97ff', label: 'Motion' },
  { id: 'looks', color: '#9966ff', label: 'Looks' },
  { id: 'sound', color: '#cf63cf', label: 'Sound' },
  { id: 'events', color: '#ffbf00', label: 'Events' },
  { id: 'control', color: '#ffab19', label: 'Control' },
  { id: 'sensing', color: '#5cb1d6', label: 'Sensing' },
  { id: 'operators', color: '#59c059', label: 'Operators' },
  { id: 'variables', color: '#ff8c1a', label: 'Variables' },
  { id: 'myblocks', color: '#ff6680', label: 'My Blocks' },
];

export const CATEGORY_COLORS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

export const KEY_OPTIONS = ['space', 'up arrow', 'down arrow', 'right arrow', 'left arrow', 'any',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''), ...'0123456789'.split('')];

const defs = [];
const add = (opcode, cat, shape, parts, extra = {}) =>
  defs.push({ opcode, cat, shape, parts, ...extra });

/* ------------------------------------------------------------------ motion */
add('motion_movesteps', 'motion', 'stack', ['move', N('STEPS'), 'steps']);
add('motion_turnright', 'motion', 'stack', ['turn', { icon: 'right' }, N('DEGREES', '15'), 'degrees']);
add('motion_turnleft', 'motion', 'stack', ['turn', { icon: 'left' }, N('DEGREES', '15'), 'degrees']);
add('motion_goto', 'motion', 'stack', ['go to', M('TO', 'sprites', '_random_')]);
add('motion_gotoxy', 'motion', 'stack', ['go to x:', N('X', '0'), 'y:', N('Y', '0')]);
add('motion_glidesecstoxy', 'motion', 'stack', ['glide', N('SECS', '1'), 'secs to x:', N('X', '0'), 'y:', N('Y', '0')]);
add('motion_glideto', 'motion', 'stack', ['glide', N('SECS', '1'), 'secs to', M('TO', 'sprites', '_random_')]);
add('motion_pointindirection', 'motion', 'stack', ['point in direction', N('DIRECTION', '90')]);
add('motion_pointtowards', 'motion', 'stack', ['point towards', M('TOWARDS', 'sprites', '_mouse_')]);
add('motion_changexby', 'motion', 'stack', ['change x by', N('DX')]);
add('motion_setx', 'motion', 'stack', ['set x to', N('X', '0')]);
add('motion_changeyby', 'motion', 'stack', ['change y by', N('DY')]);
add('motion_sety', 'motion', 'stack', ['set y to', N('Y', '0')]);
add('motion_ifonedgebounce', 'motion', 'stack', ['if on edge, bounce']);
add('motion_setrotationstyle', 'motion', 'stack', ['set rotation style', F('STYLE', ["left-right", "don't rotate", 'all around'], 'all around')]);
add('motion_xposition', 'motion', 'reporter', ['x position']);
add('motion_yposition', 'motion', 'reporter', ['y position']);
add('motion_direction', 'motion', 'reporter', ['direction']);

/* ------------------------------------------------------------------- looks */
add('looks_say', 'looks', 'stack', ['say', S('MESSAGE', 'Hello!')]);
add('looks_sayforsecs', 'looks', 'stack', ['say', S('MESSAGE', 'Hello!'), 'for', N('SECS', '2'), 'seconds']);
add('looks_think', 'looks', 'stack', ['think', S('MESSAGE', 'Hmm...')]);
add('looks_thinkforsecs', 'looks', 'stack', ['think', S('MESSAGE', 'Hmm...'), 'for', N('SECS', '2'), 'seconds']);
add('looks_switchcostumeto', 'looks', 'stack', ['switch costume to', M('COSTUME', 'costumes', '')]);
add('looks_nextcostume', 'looks', 'stack', ['next costume']);
add('looks_switchbackdropto', 'looks', 'stack', ['switch backdrop to', M('BACKDROP', 'backdrops', '')]);
add('looks_switchbackdroptoandwait', 'looks', 'stack', ['switch backdrop to', M('BACKDROP', 'backdrops', ''), 'and wait']);
add('looks_nextbackdrop', 'looks', 'stack', ['next backdrop']);
add('looks_changesizeby', 'looks', 'stack', ['change size by', N('CHANGE')]);
add('looks_setsizeto', 'looks', 'stack', ['set size to', N('SIZE', '100'), '%']);
add('looks_changeeffectby', 'looks', 'stack', ['change', F('EFFECT', ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'], 'color'), 'effect by', N('CHANGE', '25')]);
add('looks_seteffectto', 'looks', 'stack', ['set', F('EFFECT', ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'], 'ghost'), 'effect to', N('VALUE', '0')]);
add('looks_cleargraphiceffects', 'looks', 'stack', ['clear graphic effects']);
add('looks_show', 'looks', 'stack', ['show']);
add('looks_hide', 'looks', 'stack', ['hide']);
add('looks_gotofrontback', 'looks', 'stack', ['go to', F('FRONT_BACK', ['front', 'back'], 'front'), 'layer']);
add('looks_goforwardbackward', 'looks', 'stack', ['go', F('FORWARD_BACKWARD', ['forward', 'backward'], 'forward'), N('NUM', '1'), 'layers']);
add('looks_costumenumbername', 'looks', 'reporter', ['costume', F('NUMBER_NAME', ['number', 'name'], 'number')]);
add('looks_backdropnumbername', 'looks', 'reporter', ['backdrop', F('NUMBER_NAME', ['number', 'name'], 'number')]);
add('looks_size', 'looks', 'reporter', ['size']);

/* ------------------------------------------------------------------- sound */
add('sound_play', 'sound', 'stack', ['start sound', M('SOUND_MENU', 'sounds', '')]);
add('sound_playuntildone', 'sound', 'stack', ['play sound', M('SOUND_MENU', 'sounds', ''), 'until done']);
add('sound_stopallsounds', 'sound', 'stack', ['stop all sounds']);
add('sound_changeeffectby', 'sound', 'stack', ['change', F('EFFECT', ['pitch', 'pan'], 'pitch'), 'effect by', N('VALUE', '10')]);
add('sound_seteffectto', 'sound', 'stack', ['set', F('EFFECT', ['pitch', 'pan'], 'pitch'), 'effect to', N('VALUE', '100')]);
add('sound_cleareffects', 'sound', 'stack', ['clear sound effects']);
add('sound_changevolumeby', 'sound', 'stack', ['change volume by', N('VOLUME', '-10')]);
add('sound_setvolumeto', 'sound', 'stack', ['set volume to', N('VOLUME', '100'), '%']);
add('sound_volume', 'sound', 'reporter', ['volume']);

/* ------------------------------------------------------------------ events */
add('event_whenflagclicked', 'events', 'hat', ['when', { icon: 'flag' }, 'clicked']);
add('event_whenkeypressed', 'events', 'hat', ['when', F('KEY_OPTION', KEY_OPTIONS, 'space'), 'key pressed']);
add('event_whenthisspriteclicked', 'events', 'hat', ['when this sprite clicked']);
add('event_whenbackdropswitchesto', 'events', 'hat', ['when backdrop switches to', M('BACKDROP', 'backdrops', '')]);
add('event_whengreaterthan', 'events', 'hat', ['when', F('WHENGREATERTHANMENU', ['LOUDNESS', 'TIMER'], 'TIMER'), '>', N('VALUE', '10')]);
add('event_whenbroadcastreceived', 'events', 'hat', ['when I receive', M('BROADCAST_OPTION', 'broadcasts', 'message1')]);
add('event_broadcast', 'events', 'stack', ['broadcast', M('BROADCAST_INPUT', 'broadcasts', 'message1')]);
add('event_broadcastandwait', 'events', 'stack', ['broadcast', M('BROADCAST_INPUT', 'broadcasts', 'message1'), 'and wait']);

/* ----------------------------------------------------------------- control */
add('control_wait', 'control', 'stack', ['wait', N('DURATION', '1'), 'seconds']);
add('control_repeat', 'control', 'c', ['repeat', N('TIMES', '10'), SUB]);
add('control_forever', 'control', 'c', ['forever', SUB], { cap: true });
add('control_if', 'control', 'c', ['if', B('CONDITION'), 'then', SUB]);
add('control_if_else', 'control', 'c', ['if', B('CONDITION'), 'then', SUB, 'else', SUB2]);
add('control_wait_until', 'control', 'stack', ['wait until', B('CONDITION')]);
add('control_repeat_until', 'control', 'c', ['repeat until', B('CONDITION'), SUB]);
add('control_while', 'control', 'c', ['while', B('CONDITION'), SUB]);
add('control_stop', 'control', 'cap', ['stop', F('STOP_OPTION', ['all', 'this script', 'other scripts in sprite'], 'all')]);
add('control_start_as_clone', 'control', 'hat', ['when I start as a clone']);
add('control_create_clone_of', 'control', 'stack', ['create clone of', M('CLONE_OPTION', 'clones', '_myself_')]);
add('control_delete_this_clone', 'control', 'stack', ['delete this clone']);

/* ----------------------------------------------------------------- sensing */
add('sensing_touchingobject', 'sensing', 'boolean', ['touching', M('TOUCHINGOBJECTMENU', 'touchables', '_mouse_'), '?']);
add('sensing_touchingcolor', 'sensing', 'boolean', ['touching color', C('COLOR', '#4c97ff'), '?']);
add('sensing_coloristouchingcolor', 'sensing', 'boolean', ['color', C('COLOR', '#4c97ff'), 'is touching', C('COLOR2', '#ff661a'), '?']);
add('sensing_distanceto', 'sensing', 'reporter', ['distance to', M('DISTANCETOMENU', 'sprites', '_mouse_')]);
add('sensing_askandwait', 'sensing', 'stack', ['ask', S('QUESTION', "What's your name?"), 'and wait']);
add('sensing_answer', 'sensing', 'reporter', ['answer']);
add('sensing_keypressed', 'sensing', 'boolean', ['key', F('KEY_OPTION', KEY_OPTIONS, 'space'), 'pressed?']);
add('sensing_mousedown', 'sensing', 'boolean', ['mouse down?']);
add('sensing_mousex', 'sensing', 'reporter', ['mouse x']);
add('sensing_mousey', 'sensing', 'reporter', ['mouse y']);
add('sensing_setdragmode', 'sensing', 'stack', ['set drag mode', F('DRAG_MODE', ['draggable', 'not draggable'], 'draggable')]);
add('sensing_resettimer', 'sensing', 'stack', ['reset timer']);
add('sensing_timer', 'sensing', 'reporter', ['timer']);
add('sensing_of', 'sensing', 'reporter', [F('PROPERTY', ['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume', 'stage width', 'stage height'], 'x position'), 'of', M('OBJECT', 'objects', '_stage_')]);
add('sensing_current', 'sensing', 'reporter', ['current', F('CURRENTMENU', ['YEAR', 'MONTH', 'DATE', 'DAYOFWEEK', 'HOUR', 'MINUTE', 'SECOND'], 'YEAR')]);
add('sensing_dayssince2000', 'sensing', 'reporter', ['days since 2000']);
add('sensing_username', 'sensing', 'reporter', ['username']);
add('sensing_loudness', 'sensing', 'reporter', ['loudness']);

/* --------------------------------------------------------------- operators */
add('operator_add', 'operators', 'reporter', [N('NUM1', ''), '+', N('NUM2', '')]);
add('operator_subtract', 'operators', 'reporter', [N('NUM1', ''), '−', N('NUM2', '')]);
add('operator_multiply', 'operators', 'reporter', [N('NUM1', ''), '×', N('NUM2', '')]);
add('operator_divide', 'operators', 'reporter', [N('NUM1', ''), '÷', N('NUM2', '')]);
add('operator_random', 'operators', 'reporter', ['pick random', N('FROM', '1'), 'to', N('TO', '10')]);
add('operator_gt', 'operators', 'boolean', [S('OPERAND1', ''), '>', S('OPERAND2', '50')]);
add('operator_lt', 'operators', 'boolean', [S('OPERAND1', ''), '<', S('OPERAND2', '50')]);
add('operator_equals', 'operators', 'boolean', [S('OPERAND1', ''), '=', S('OPERAND2', '50')]);
add('operator_and', 'operators', 'boolean', [B('OPERAND1'), 'and', B('OPERAND2')]);
add('operator_or', 'operators', 'boolean', [B('OPERAND1'), 'or', B('OPERAND2')]);
add('operator_not', 'operators', 'boolean', ['not', B('OPERAND')]);
add('operator_join', 'operators', 'reporter', ['join', S('STRING1', 'apple '), S('STRING2', 'banana')]);
add('operator_letter_of', 'operators', 'reporter', ['letter', N('LETTER', '1'), 'of', S('STRING', 'apple')]);
add('operator_length', 'operators', 'reporter', ['length of', S('STRING', 'apple')]);
add('operator_contains', 'operators', 'boolean', [S('STRING1', 'apple'), 'contains', S('STRING2', 'a'), '?']);
add('operator_mod', 'operators', 'reporter', [N('NUM1', ''), 'mod', N('NUM2', '')]);
add('operator_round', 'operators', 'reporter', ['round', N('NUM', '')]);
add('operator_mathop', 'operators', 'reporter', [F('OPERATOR', ['abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'e ^', '10 ^'], 'abs'), 'of', N('NUM', '')]);

/* -------------------------------------------------------------------- data */
add('data_setvariableto', 'variables', 'stack', ['set', V(), 'to', S('VALUE', '0')]);
add('data_changevariableby', 'variables', 'stack', ['change', V(), 'by', N('VALUE', '1')]);
add('data_showvariable', 'variables', 'stack', ['show variable', V()]);
add('data_hidevariable', 'variables', 'stack', ['hide variable', V()]);
add('data_addtolist', 'variables', 'stack', ['add', S('ITEM', 'thing'), 'to', L()]);
add('data_deleteoflist', 'variables', 'stack', ['delete', N('INDEX', '1'), 'of', L()]);
add('data_deletealloflist', 'variables', 'stack', ['delete all of', L()]);
add('data_insertatlist', 'variables', 'stack', ['insert', S('ITEM', 'thing'), 'at', N('INDEX', '1'), 'of', L()]);
add('data_replaceitemoflist', 'variables', 'stack', ['replace item', N('INDEX', '1'), 'of', L(), 'with', S('ITEM', 'thing')]);
add('data_itemoflist', 'variables', 'reporter', ['item', N('INDEX', '1'), 'of', L()]);
add('data_itemnumoflist', 'variables', 'reporter', ['item # of', S('ITEM', 'thing'), 'in', L()]);
add('data_lengthoflist', 'variables', 'reporter', ['length of', L()]);
add('data_listcontainsitem', 'variables', 'boolean', [L(), 'contains', S('ITEM', 'thing'), '?']);

/* -------------------------------------------------------------- procedures */
add('argument_reporter_string_number', 'myblocks', 'reporter', [F('VALUE', [], 'value')]);
add('argument_reporter_boolean', 'myblocks', 'boolean', [F('VALUE', [], 'value')]);

export const BLOCKS = Object.fromEntries(defs.map((d) => [d.opcode, d]));

export function getDef(opcode) {
  if (BLOCKS[opcode]) return BLOCKS[opcode];
  // live custom blocks live in the project; a generic shape keeps them renderable
  return {
    opcode,
    cat: 'myblocks',
    shape: opcode === 'procedures_definition' ? 'hat' : opcode === 'procedures_prototype' ? 'hat' : 'stack',
    parts: ['custom block'],
  };
}

export const HATS = defs.filter((d) => d.shape === 'hat').map((d) => d.opcode);
export const OPCODES = defs.map((d) => d.opcode);

export function isHat(opcode) { return getDef(opcode).shape === 'hat'; }
export function isReporter(opcode) {
  const s = getDef(opcode).shape;
  return s === 'reporter' || s === 'boolean';
}
export function isBooleanOpcode(opcode) { return getDef(opcode).shape === 'boolean'; }
export function categoryColor(opcodeOrCat) {
  return CATEGORY_COLORS[opcodeOrCat] || CATEGORY_COLORS[getDef(opcodeOrCat).cat] || '#4c97ff';
}

/** Default inputs/fields for a freshly dropped block. */
export function defaultBlockData(opcode, project, target) {
  const def = getDef(opcode);
  const inputs = {};
  const fields = {};
  for (const part of def.parts) {
    if (typeof part === 'string' || !part) continue;
    if (part.i === 'SUBSTACK' || part.i === 'SUBSTACK2') continue;
    if (part.f) {
      if (part.k === 'var') {
        const vars = target?.variables || {};
        const first = Object.entries(vars)[0];
        fields[part.f] = [first ? first[0] : 'variable', first ? first[1][0] : 'my variable'];
      } else if (part.k === 'list') {
        const lists = target?.lists || {};
        const first = Object.entries(lists)[0];
        fields[part.f] = [first ? first[0] : 'list', first ? first[1][0] : 'my list'];
      } else if (part.k === 'color') {
        fields[part.f] = [part.v || '#4c97ff', null];
      } else if (part.k === 'dropdown') {
        fields[part.f] = [part.v ?? part.opts?.[0] ?? '', null];
      }
      continue;
    }
    if (part.k === 'boolean') continue;
    if (part.k === 'number') {
      inputs[part.i] = [1, [4, String(part.v ?? '')]];
    } else if (part.k === 'text') {
      inputs[part.i] = [1, [10, String(part.v ?? '')]];
    } else if (part.k === 'menu') {
      let value = part.v ?? '';
      if (part.menu === 'costumes') value = target?.costumes?.[0]?.name ?? '';
      if (part.menu === 'backdrops') value = project?.targets?.[0]?.costumes?.[0]?.name ?? 'backdrop1';
      if (part.menu === 'sounds') value = target?.sounds?.[0]?.name ?? '';
      if (part.menu === 'sprites') value = '_random_';
      if (part.menu === 'broadcasts') value = Object.values(target?.broadcasts || {})[0] || 'message1';
      fields[part.i] = [String(value), null];
    }
  }
  return { inputs, fields };
}

/**
 * Parse a custom block signature typed by the user, e.g.
 *   "jump %n px with %s"  → number + text argument
 *   "%b ?" %b → boolean
 */
export function parseSignature(signature) {
  const args = [];
  const names = [];
  let proccode = '';
  const tokens = String(signature || '').trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const m = /^%(.)$/.exec(token);
    if (m && 'nsb'.includes(m[1])) {
      const kind = m[1] === 'n' ? 'number' : m[1] === 's' ? 'string' : 'boolean';
      const id = `arg_${args.length}_${Math.random().toString(36).slice(2, 7)}`;
      args.push({ id, name: `arg${args.length + 1}`, kind });
      proccode += ` %${m[1]}`;
    } else {
      proccode += (proccode ? ' ' : '') + token;
    }
  }
  if (!proccode.trim()) return null;
  return {
    proccode: proccode.trim(),
    args,
    names,
    warp: false,
    argIds: args.map((a, i) => `${i}`),
    argNames: args.map((a) => a.name),
  };
}

export function signatureFromMutation(mutation) {
  if (!mutation) return '';
  let text = mutation.proccode || '';
  text = text.replace(/%n/g, '%n').replace(/%s/g, '%s').replace(/%b/g, '%b');
  return text;
}
