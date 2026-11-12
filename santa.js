'use strict';

// Legacy dance values become a pose. Joint angles are offsets from the idle
// stance, in radians, with left/right named from Santa's perspective.
function createSantaDancePose(sway = 0, bounce = 0) {
  return {
    root: {
      position: { x: sway * 0.23, y: bounce * 0.13, z: 0 },
      rotation: { x: 0, y: sway * 0.20, z: -sway * 0.10 },
    },
    joints: {
      leftArm: { x: sway * 0.38, z: 0.36 * bounce - sway * 0.48 },
      rightArm: { x: -sway * 0.38, z: -0.36 * bounce - sway * 0.48 },
      leftLeg: { x: Math.max(0, sway) * -0.48, z: -sway * 0.18 },
      rightLeg: { x: Math.max(0, -sway) * -0.48, z: -sway * 0.18 },
      leftElbow: { x: -0.25 - Math.max(0, sway) * 0.5 },
      rightElbow: { x: -0.25 - Math.max(0, -sway) * 0.5 },
      leftKnee: { x: Math.max(0, sway) * 0.65 },
      rightKnee: { x: Math.max(0, -sway) * 0.65 },
    },
  };
}

function createSantaStage(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
  if (!gl) throw new Error('WebGL is unavailable');

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `
    attribute vec3 vertex;
    uniform mat4 model;
    uniform vec3 size;
    varying vec3 normal;
    void main() {
      vec3 point = (model * vec4(vertex * size, 1.0)).xyz;
      normal = (model * vec4(vertex / size, 0.0)).xyz;
      gl_Position = vec4(point.x / 2.35, (point.y + 0.12) / 1.88, -point.z / 6.0, 1.0);
    }
  `));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec3 color;
    varying vec3 normal;
    void main() {
      vec3 n = normalize(normal);
      vec3 light = normalize(vec3(-0.6, 0.9, 1.1));
      float diffuse = max(0.0, dot(n, light));
      float shine = pow(max(0.0, dot(n, normalize(light + vec3(0.0, 0.0, 1.0)))), 28.0);
      gl_FragColor = vec4(color * (0.52 + 0.48 * diffuse) + 0.13 * shine, 1.0);
    }
  `));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  // Reuse one sphere mesh for the sculpted parts. The depth buffer handles occlusion.
  const vertices = [];
  const indices = [];
  const rings = 20;
  const segments = 32;
  for (let ring = 0; ring <= rings; ring++) {
    const latitude = Math.PI * ring / rings;
    for (let segment = 0; segment <= segments; segment++) {
      const longitude = 2 * Math.PI * segment / segments;
      vertices.push(Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude),
        Math.sin(latitude) * Math.sin(longitude));
      if (ring < rings && segment < segments) {
        const here = ring * (segments + 1) + segment;
        const next = here + segments + 1;
        indices.push(here, next, here + 1, here + 1, next, next + 1);
      }
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const vertex = gl.getAttribLocation(program, 'vertex');
  gl.enableVertexAttribArray(vertex);
  gl.vertexAttribPointer(vertex, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);

  const modelUniform = gl.getUniformLocation(program, 'model');
  const sizeUniform = gl.getUniformLocation(program, 'size');
  const colorUniform = gl.getUniformLocation(program, 'color');
  const red = [0.82, 0.13, 0.21];
  const darkRed = [0.58, 0.08, 0.13];
  const fur = [0.99, 0.94, 0.83];
  const skin = [0.96, 0.64, 0.48];
  const rose = [0.91, 0.40, 0.36];
  const leather = [0.12, 0.10, 0.15];
  const gold = [0.98, 0.68, 0.23];

  function multiply(left, right) {
    const result = new Float32Array(16);
    for (let column = 0; column < 16; column += 4) {
      for (let row = 0; row < 4; row++) {
        result[column + row] = left[row] * right[column]
          + left[row + 4] * right[column + 1]
          + left[row + 8] * right[column + 2]
          + left[row + 12] * right[column + 3];
      }
    }
    return result;
  }

  function translate(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }

  function rotateX(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  }

  function rotateY(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }

  function rotateZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  // Column vectors use Ry * Rz * Rx, so X is applied first, then Z, then Y.
  function rotate(parent, angles) {
    let model = parent;
    if (angles.y) model = multiply(model, rotateY(angles.y));
    if (angles.z) model = multiply(model, rotateZ(angles.z));
    if (angles.x) model = multiply(model, rotateX(angles.x));
    return model;
  }

  function pivot(parent, x, y, z, angles) {
    if (!angles.x && !angles.y && !angles.z) return parent;
    return multiply(rotate(multiply(parent, translate(x, y, z)), angles), translate(-x, -y, -z));
  }

  function vector(value = {}, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(name + ' must be an object with finite x, y, z values');
    }
    const result = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z']) {
      if (value[axis] !== undefined) {
        if (!Number.isFinite(value[axis])) {
          throw new TypeError(name + '.' + axis + ' must be a finite number');
        }
        result[axis] = value[axis];
      }
    }
    return result;
  }

  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(name + ' must be an object');
    }
    return value;
  }

  function part(parent, x, y, z, width, height, depth, color, tilt = 0) {
    let model = multiply(parent, translate(x, y, z));
    if (tilt) model = multiply(model, rotateZ(tilt));
    gl.uniformMatrix4fv(modelUniform, false, model);
    gl.uniform3f(sizeUniform, width, height, depth);
    gl.uniform3fv(colorUniform, color);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function armRig(side, shoulderAngles, elbowAngles) {
    const upper = rotate(translate(side * 0.74, 0.20, 0.02), {
      x: -0.22 + shoulderAngles.x,
      y: shoulderAngles.y,
      z: side * 0.45 + shoulderAngles.z,
    });
    const lower = rotate(multiply(upper, translate(0, -0.32, 0)), elbowAngles);
    return { upper, lower };
  }

  // Distance from a sphere center to the coat ellipsoid in torso coordinates.
  // Slightly enlarged radii also cover the belt and white coat trim.
  function hitsCoat(model, y, radius, x = 0, z = 0) {
    const point = [
      Math.abs(model[0] * x + model[4] * y + model[8] * z + model[12]),
      Math.abs(model[1] * x + model[5] * y + model[9] * z + model[13] + 0.24),
      Math.abs(model[2] * x + model[6] * y + model[10] * z + model[14]),
    ];
    const radii = [0.69, 0.62, 0.52];
    const squared = radii.map(value => value * value);
    if (point.reduce((sum, value, i) => sum + value * value / squared[i], 0) <= 1) return true;
    let low = 0;
    let high = 0.69 * Math.hypot(...point);
    for (let iteration = 0; iteration < 18; iteration++) {
      const middle = (low + high) / 2;
      const surface = point.reduce((sum, value, i) =>
        sum + (radii[i] * value / (middle + squared[i])) ** 2, 0);
      if (surface > 1) low = middle;
      else high = middle;
    }
    const distance = point.reduce((sum, value, i) =>
      sum + (value - squared[i] * value / (high + squared[i])) ** 2, 0);
    return distance < radius * radius;
  }

  function armHitsCoat(side, shoulder, elbow) {
    const rig = armRig(side, shoulder, elbow);
    // Overlapping bounding spheres cover the sleeves and glove. The shoulder
    // ball itself is the intentional seam connecting the arm to the coat.
    return [0.12, 0.22, 0.32].some(y => hitsCoat(rig.upper, -y, 0.18))
      || [0, 0.10, 0.20, 0.30, 0.40].some(y => hitsCoat(rig.lower, -y, 0.20))
      || hitsCoat(rig.lower, -0.37, 0.10, -side * 0.10, 0.11);
  }

  function constrainArm(side, shoulder, elbow) {
    shoulder.x = clamp(shoulder.x, -1.2, 0.8);
    shoulder.y = clamp(shoulder.y, -0.65, 0.65);
    let spread = clamp(0.45 + side * shoulder.z, 0.15, 2.1);
    shoulder.z = side * (spread - 0.45);
    while (armHitsCoat(side, shoulder, elbow) && spread < 2.1) {
      spread = Math.min(2.1, spread + 0.06);
      shoulder.z = side * (spread - 0.45);
    }
    if (armHitsCoat(side, shoulder, elbow)) {
      shoulder.x = 0.22;
      shoulder.y = 0;
      shoulder.z = side * (Math.PI / 2 - 0.45);
      while (armHitsCoat(side, shoulder, elbow) && elbow.x < 0) {
        elbow.x = Math.min(0, elbow.x + 0.06);
      }
    }
  }

  function limb(root, torso, side, legAngles, armAngles, kneeAngles, elbowAngles) {
    const hip = multiply(root, translate(side * 0.29, -0.57, 0));
    const leg = rotate(hip, { ...legAngles, z: side * 0.10 + legAngles.z });
    part(leg, 0, -0.14, 0, 0.18, 0.22, 0.19, darkRed);
    const knee = rotate(multiply(leg, translate(0, -0.31, 0)), kneeAngles);
    part(knee, 0, 0, 0, 0.15, 0.15, 0.16, darkRed);
    part(knee, 0, -0.14, 0, 0.155, 0.21, 0.17, darkRed);
    part(knee, 0, -0.29, 0.02, 0.19, 0.15, 0.21, leather);
    part(knee, 0, -0.39, 0.12, 0.22, 0.13, 0.32, leather);

    const rig = armRig(side, armAngles, elbowAngles);
    const upper = multiply(torso, rig.upper);
    const lower = multiply(torso, rig.lower);
    part(torso, side * 0.64, 0.20, 0.02, 0.22, 0.18, 0.17, red);
    part(upper, 0, -0.15, 0, 0.145, 0.21, 0.15, red);
    part(lower, 0, 0, 0, 0.145, 0.145, 0.15, darkRed);
    part(lower, 0, -0.14, 0, 0.13, 0.19, 0.14, red);
    part(lower, 0, -0.29, 0.02, 0.145, 0.09, 0.15, fur);
    part(lower, 0, -0.40, 0.04, 0.14, 0.14, 0.15, leather);
    part(lower, -side * 0.10, -0.37, 0.11, 0.06, 0.09, 0.07, leather);
  }

  function head(body) {
    part(body, 0, 0.66, 0.03, 0.44, 0.42, 0.39, skin);
    part(body, 0, 0.44, 0.27, 0.43, 0.35, 0.30, fur);
    part(body, 0, 0.40, 0.565, 0.10, 0.048, 0.023, leather);
    for (const side of [-1, 1]) {
      part(body, side * 0.32, 0.58, 0.28, 0.095, 0.06, 0.075, rose);
      part(body, side * 0.148, 0.72, 0.385, 0.038, 0.048, 0.033, leather);
      part(body, side * 0.15, 0.81, 0.355, 0.105, 0.036, 0.040, fur, side * -0.15);
      part(body, side * 0.125, 0.495, 0.523, 0.16, 0.072, 0.065, fur, side * 0.26);
    }
    part(body, 0, 0.605, 0.438, 0.108, 0.075, 0.09, rose);
    part(body, 0, 0.94, 0.025, 0.49, 0.12, 0.43, fur, -0.09);
    part(body, 0.038, 1.09, 0.025, 0.40, 0.28, 0.34, red, 0.32);
    part(body, 0.234, 1.23, 0.015, 0.24, 0.14, 0.20, red, 0.16);
    part(body, 0.405, 1.18, 0.035, 0.132, 0.13, 0.13, fur);
  }

  // Each call is a complete frame. Missing joints/axes reset to the idle pose.
  function drawPose(pose = {}, turn = 0) {
    object(pose, 'pose');
    const root = object(pose.root === undefined ? {} : pose.root, 'pose.root');
    const joints = object(pose.joints === undefined ? {} : pose.joints, 'pose.joints');
    const position = vector(root.position, 'pose.root.position');
    const rotation = vector(root.rotation, 'pose.root.rotation');
    const angles = {};
    for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'torso', 'head',
      'leftElbow', 'rightElbow', 'leftKnee', 'rightKnee']) {
      angles[name] = vector(joints[name], 'pose.joints.' + name);
    }
    if (!Number.isFinite(turn)) throw new TypeError('turn must be a finite number');
    for (const side of ['left', 'right']) {
      const elbow = angles[side + 'Elbow'];
      const knee = angles[side + 'Knee'];
      elbow.x = clamp(elbow.x, -Math.PI * 0.75, 0);
      knee.x = clamp(knee.x, 0, Math.PI * 0.75);
      elbow.y = elbow.z = knee.y = knee.z = 0;
      constrainArm(side === 'left' ? 1 : -1, angles[side + 'Arm'], elbow);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const camera = rotateX(0.16);
    part(camera, position.x * (0.13 / 0.23), -1.37, position.z,
      0.88, 0.014, 0.52, [0.24, 0.39, 0.41]);
    const pelvis = rotate(multiply(camera, translate(position.x, position.y, position.z)),
      { ...rotation, y: turn + rotation.y });
    const body = pivot(pelvis, 0, -0.57, 0, angles.torso);
    limb(pelvis, body, -1, angles.rightLeg, angles.rightArm, angles.rightKnee, angles.rightElbow);
    limb(pelvis, body, 1, angles.leftLeg, angles.leftArm, angles.leftKnee, angles.leftElbow);
    part(body, 0, -0.24, 0, 0.66, 0.60, 0.49, red);
    part(body, 0, -0.19, 0.42, 0.063, 0.41, 0.084, fur);
    part(body, 0, -0.41, 0.015, 0.652, 0.133, 0.494, leather);
    part(body, 0, -0.40, 0.49, 0.146, 0.098, 0.054, gold);
    part(body, 0, -0.40, 0.54, 0.080, 0.047, 0.014, leather);
    head(pivot(body, 0, 0.38, 0.03, angles.head));
    return { root: { position, rotation }, joints: angles };
  }

  function draw(sway = 0, bounce = 0, turn = 0) {
    drawPose(createSantaDancePose(sway, bounce), turn);
  }

  draw.drawPose = drawPose;
  return draw;
}
