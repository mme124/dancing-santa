const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function createStage() {
  const calls = [];
  let matrix, size, color;
  const gl = new Proxy({
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getUniformLocation: (_, name) => name,
    uniformMatrix4fv: (_, transpose, value) => { matrix = Array.from(value); },
    uniform3f: (_, ...value) => { size = value; },
    uniform3fv: (_, value) => { color = Array.from(value); },
    drawElements: () => calls.push({ matrix, size, color }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  const context = vm.createContext({});
  vm.runInContext(readFileSync(join(__dirname, 'santa.js'), 'utf8'), context);
  const draw = context.createSantaStage({ width: 800, height: 640, getContext: () => gl });
  function render(pose, turn = 0) {
    calls.length = 0;
    draw.drawPose(pose, turn);
    return calls.slice();
  }
  return { draw, calls, render, context };
}

test('legacy dance API and frame API both animate the articulated model', () => {
  const { draw, calls, render, context } = createStage();
  for (const values of [[0, 0, 0], [0.71, 0.42, 0.33], [-0.83, 1, -2], [1, 0.5, 3.14]]) {
    calls.length = 0;
    draw(...values);
    const legacy = calls.slice();
    assert.equal(legacy.length, 46);
    assert.ok(legacy.every(call => call.matrix.every(Number.isFinite)));
    assert.deepEqual(render(context.createSantaDancePose(values[0], values[1]), values[2]), legacy);
  }
});

test('each joint controls its own parts and torso moves its head and arms', () => {
  const { render } = createStage();
  const idle = render({});
  const affected = {
    leftArm: [19, 20, 21, 22, 23, 24],
    rightArm: [7, 8, 9, 10, 11, 12],
    leftLeg: [13, 14, 15, 16, 17],
    rightLeg: [1, 2, 3, 4, 5],
    leftElbow: [20, 21, 22, 23, 24],
    rightElbow: [8, 9, 10, 11, 12],
    leftKnee: [14, 15, 16, 17],
    rightKnee: [2, 3, 4, 5],
    torso: [6, 7, 8, 9, 10, 11, 12, 18, 19, 20, 21, 22, 23, 24,
      ...Array.from({ length: 21 }, (_, i) => i + 25)],
    head: Array.from({ length: 16 }, (_, i) => i + 30),
  };
  for (const [name, indexes] of Object.entries(affected)) {
    const hinge = name.endsWith('Elbow') || name.endsWith('Knee');
    for (const axis of hinge ? ['x'] : ['x', 'y', 'z']) {
      const amount = name.endsWith('Elbow') || (name === 'rightArm' && axis === 'z') ? -0.4 : 0.4;
      const result = render({ joints: { [name]: { [axis]: amount } } });
      const changed = result.flatMap((call, i) =>
        call.matrix.some((value, j) => Math.abs(value - idle[i].matrix[j]) > 1e-7) ? [i] : []);
      assert.deepEqual(changed, indexes, name + ' ' + axis);
    }
  }
});

test('frames are complete, immutable, and independently reproducible', () => {
  const { draw, render, context } = createStage();
  const pose = { root: { position: { y: 0.2 } }, joints: { head: { y: 0.6 } } };
  const original = JSON.stringify(pose);
  const first = render(pose, 0.3);
  render({ joints: { leftArm: { z: 0.9 } } });
  assert.deepEqual(render(pose, 0.3), first);
  assert.equal(JSON.stringify(pose), original);
  const idle = render({});
  draw(0, 0, 0);
  assert.deepEqual(render(), idle);
  const dance = context.createSantaDancePose(0.6, 0.2);
  dance.joints.head = { y: 0.5 };
  assert.ok(render(dance).every(call => call.matrix.every(Number.isFinite)));
});

test('invalid pose values fail before drawing a partial frame', () => {
  const { render, calls } = createStage();
  for (const pose of [
    null, [], { root: null }, { joints: [] },
    { joints: { leftArm: null } }, { joints: { head: { y: NaN } } },
    { root: { position: { x: Infinity } } }, { joints: { head: { x: '1' } } },
    { joints: { leftElbow: { x: NaN } } }, { joints: { rightKnee: null } },
  ]) {
    assert.throws(() => render(pose), { name: 'TypeError' });
    assert.equal(calls.length, 0);
  }
  assert.throws(() => render({}, Infinity), { name: 'TypeError' });
  assert.equal(calls.length, 0);
});

test('elbows and knees bend in one direction and return applied limits', () => {
  const { draw } = createStage();
  const pose = draw.drawPose({ joints: {
    leftElbow: { x: -10, y: 1, z: 1 }, rightElbow: { x: 1 },
    leftKnee: { x: 10, y: 1, z: 1 }, rightKnee: { x: -1 },
  } });
  assert.ok(pose.joints.leftElbow.x >= -Math.PI * 0.75);
  assert.equal(pose.joints.rightElbow.x, 0);
  assert.equal(pose.joints.leftKnee.x, Math.PI * 0.75);
  assert.equal(pose.joints.rightKnee.x, 0);
  for (const name of ['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee']) {
    assert.equal(pose.joints[name].y, 0);
    assert.equal(pose.joints[name].z, 0);
  }
});

test('sleeves and gloves stay outside the coat across extreme shoulder and elbow inputs', () => {
  const { render } = createStage();
  const armParts = [7, 8, 9, 10, 11, 12, 19, 20, 21, 22, 23, 24];
  const surface = [[0, 0, 0]];
  for (let ring = 0; ring <= 12; ring++) {
    for (let segment = 0; segment < 20; segment++) {
      const latitude = ring * Math.PI / 12;
      const longitude = segment * Math.PI / 10;
      surface.push([Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude),
        Math.sin(latitude) * Math.sin(longitude)]);
    }
  }
  for (const x of [-1.5, 0, 1.5]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1.5, 0, 1.5]) {
        for (const elbow of [-2.35, -1, 0]) {
          const calls = render({ joints: {
            leftArm: { x, y, z }, rightArm: { x, y, z },
            leftElbow: { x: elbow }, rightElbow: { x: elbow },
            torso: { x: 0.2, y: -0.3, z: 0.15 },
          } }, 0.4);
          const coat = calls[25];
          const body = coat.matrix;
          for (const index of armParts) {
            const part = calls[index];
            const m = part.matrix;
            for (const vertex of surface) {
              const [vx, vy, vz] = vertex.map((value, axis) => value * part.size[axis]);
              const world = [m[0] * vx + m[4] * vy + m[8] * vz + m[12] - body[12],
                m[1] * vx + m[5] * vy + m[9] * vz + m[13] - body[13],
                m[2] * vx + m[6] * vy + m[10] * vz + m[14] - body[14]];
              const local = [0, 4, 8].map(column =>
                body[column] * world[0] + body[column + 1] * world[1] + body[column + 2] * world[2]);
              const distance = local.reduce((sum, value, axis) => sum + (value / coat.size[axis]) ** 2, 0);
              assert.ok(distance >= 0.999, 'coat penetration at part ' + index + ', pose ' + [x, y, z, elbow]);
            }
          }
        }
      }
    }
  }
});

test('demo edits elbow and knee hinges and plays articulated frames', () => {
  const { draw, context } = createStage();
  const elements = new Map();
  let frame;
  context.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: selector === '#joint' ? 'leftArm' : selector === '#turn' ? '-18' : '0',
        addEventListener(type, callback) { this[type] = callback; },
      });
      return elements.get(selector);
    },
    querySelectorAll: () => [...elements.values()],
  };
  context.createSantaStage = () => draw;
  context.requestAnimationFrame = callback => { frame = callback; return 1; };
  context.cancelAnimationFrame = () => { frame = undefined; };
  const html = readFileSync(join(__dirname, 'joint-demo.html'), 'utf8');
  vm.runInContext(html.split('<script>')[1].split('</script>')[0], context);
  const select = elements.get('#joint');
  for (const [name, degrees] of [['leftElbow', -90], ['rightKnee', 90]]) {
    select.value = name;
    select.change();
    assert.equal(elements.get('#y').disabled, true);
    assert.equal(elements.get('#z').disabled, true);
    const slider = elements.get('#x');
    slider.value = String(degrees);
    slider.input({ target: slider });
    const pose = JSON.parse(elements.get('#pose-data').textContent);
    assert.ok(Math.abs(pose.joints[name].x - degrees * Math.PI / 180) < 1e-6);
  }
  elements.get('#frames').click();
  frame(1000);
  frame(1500);
  assert.match(elements.get('#status').textContent, /16\/90/);
  const pose = JSON.parse(elements.get('#pose-data').textContent);
  assert.ok(pose.joints.leftElbow.x < 0);
  assert.ok(pose.joints.leftKnee.x > 0);
  elements.get('#reset').click();
  assert.equal(frame, undefined);
  assert.equal(JSON.parse(elements.get('#pose-data').textContent).joints.leftKnee.x, 0);
});
