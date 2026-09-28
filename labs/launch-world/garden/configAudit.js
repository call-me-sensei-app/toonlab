// Stillwater Garden — RESOLVED-CONFIGURATION AUDIT.
//
// WHY THIS EXISTS
//
// Three defects were reviewed for two full passes as art-direction problems
// while being, in fact, configuration: ground adoption reading a tint that
// scaled it to a third, a water `preset: 'pond'` that silently resolved to
// `calm`, and trunk `receiveShadow` switched off. Every one was sitting in
// plain text in this scene's own settings, and every one produced a perfectly
// plausible frame. Review by eye cannot catch that class, because the failure
// mode is a picture that looks like a picture.
//
// So this is the second half of the capture-integrity guard. The existing one
// (`capture-launch-garden.mjs`) proves a frame is REAL — not a vite overlay,
// not a black canvas. This one proves a frame is REPRESENTATIVE — that the
// scene which produced it had every system it claims to be demonstrating
// actually switched on and actually carrying the values it was authored with.
//
// THE ONE RULE: CHECK RESOLVED, NEVER PASSED.
//
// `createWaterSettings({ preset: 'pond' })` accepts the string and returns
// `preset: 'calm'`. `createGroundShaderMesh({ settings })` accepts a full
// profile and the style bundle then overwrites every uniform from the shipped
// preset. `field.applySettings({ preset })` re-applies preset values over
// per-role authoring. In all three the passed value and the resolved value
// differ, nothing warns, and the render is fine-looking and wrong. So every
// check below reads back from the thing that renders — a resolved settings
// object, a live uniform, or an object3d flag — and compares it to what the
// scene declared it wanted.
//
// CATEGORIES
//
//   enum       a preset/style/tone/quality string must survive resolution
//   uniform    a value known to be overwritten downstream, read off the shader
//   flag       something the library defaults ON that a scene can switch off
//   health     a pass or system that can exist while producing nothing
//   declared   a deliberate deviation, printed WITH ITS REASON rather than
//              hidden in a file — an override is allowed, silence is not
//
// A `fail` blocks the capture. A `declared` never blocks; it appears in the
// log so the reason travels with the frame.

const OK = 'pass';
const FAIL = 'fail';
const DECLARED = 'declared';

function approx(a, b, tolerance = 1e-3) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function readColor(value) {
  if (!value) return null;
  if (value.isColor) return [+value.r.toFixed(4), +value.g.toFixed(4), +value.b.toFixed(4)];
  if (Array.isArray(value)) return value.map((v) => +Number(v).toFixed(4));
  return null;
}

/**
 * Collects the distinct materials under `root` that carry `uniformName`.
 * Used for uniform readback — the only honest way to check a value that a
 * later system is known to rewrite (D19-205, D19-233, D19-236).
 */
function materialsWithUniform(root, uniformName) {
  const found = [];
  const seen = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (seen.has(material) || !material?.uniforms?.[uniformName]) continue;
      seen.add(material);
      found.push(material);
    }
  });
  return found;
}

/**
 * Audits a built garden against what it declared it wanted.
 *
 * @param {object} world  the object `createStillwaterGarden` returns
 * @param {object} expected  the scene's own declaration of intent
 * @returns {{ ok: boolean, checks: object[], failures: object[], summary: string }}
 */
export function auditGardenConfiguration(world, expected) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, ...detail });
  const enumCheck = (id, passedValue, resolvedValue, note) => {
    add(id, passedValue === resolvedValue ? OK : FAIL, {
      category: 'enum', expected: passedValue, resolved: resolvedValue, note,
    });
  };

  // --- 1. Water: every enum resolved back ----------------------------------
  //
  // D19-234. This is the check that would have caught `pond` on day one.
  for (const [label, surface, want] of [
    ['pond', world.water, expected.water.pond],
    ['upperPool', world.upperPool, expected.water.upperPool],
  ]) {
    const resolved = surface?.settings ?? null;
    if (!resolved) {
      add(`water.${label}.settings`, FAIL, {
        category: 'enum',
        note: 'Water surface exposes no resolved settings; the audit cannot verify it.',
      });
      continue;
    }
    enumCheck(`water.${label}.preset`, want.preset, resolved.preset,
      'An unregistered preset silently becomes another one (D19-004/D19-234).');
    enumCheck(`water.${label}.style`, want.style, resolved.style,
      'The scene must actually be running the style it names.');
    enumCheck(`water.${label}.colorTone`, want.colorTone, resolved.colorTone,
      'The call_me_sensei water style registers colorTone: anime; passing classic '
      + 'silently opts the water out of the style it claims to use.');
  }

  // --- 2. Ground: uniform readback -----------------------------------------
  //
  // D19-236. The ground profile is passed at construction and overwritten by
  // the style bundle, so the settings object proves nothing. These read the
  // uniforms the shader samples.
  const groundMaterial = Array.isArray(world.ground?.material)
    ? world.ground.material[0]
    : world.ground?.material;
  const groundUniforms = groundMaterial?.uniforms ?? {};
  for (const [key, uniformName, want] of expected.groundUniforms) {
    const value = groundUniforms[uniformName]?.value;
    if (value === undefined) {
      add(`ground.${key}`, FAIL, {
        category: 'uniform', expected: want, resolved: '<uniform absent>', uniform: uniformName,
      });
      continue;
    }
    const resolved = typeof value === 'number' ? +value.toFixed(4) : readColor(value);
    const matches = typeof want === 'number'
      ? approx(resolved, want)
      : JSON.stringify(resolved) === JSON.stringify(want);
    add(`ground.${key}`, matches ? OK : FAIL, {
      category: 'uniform',
      expected: want,
      resolved,
      uniform: uniformName,
      note: matches ? undefined
        : 'The style bundle re-authors the ground slot after construction; the scene '
          + 'profile must be re-applied through applyGroundShader (D19-236).',
    });
  }

  // The four layer albedos. With no map bound `sampleProjectedLayer` returns
  // vec3(1) and the ground renders `tint x 1` — a flat wash that looks like a
  // grading problem and is not one (D19-239).
  const layerRoles = (world.groundLayers ?? []).map((l) => l.role);
  add('ground.layerAlbedos', layerRoles.length === 4 ? OK : FAIL, {
    category: 'health',
    expected: 4,
    resolved: layerRoles.length,
    note: `roles=${layerRoles.join(',')}`,
  });

  // --- 3. Grass: ground adoption, read off the material --------------------
  //
  // D19-233. `groundAdoptStrength` is re-applied from the preset after the
  // bundle and `groundAdoptTint` MULTIPLIES the sampled ground colour, so the
  // setting the scene passed at construction is not evidence of anything.
  for (const { field, role } of world.grassFields ?? []) {
    const [material] = materialsWithUniform(field, 'uGroundAdoptStrength');
    if (!material) {
      add(`grass.${role.id}.adoption`, FAIL, {
        category: 'uniform',
        note: 'No grass material exposes uGroundAdoptStrength; adoption cannot be verified.',
      });
      continue;
    }
    const strength = material.uniforms.uGroundAdoptStrength.value;
    const tint = readColor(material.uniforms.uGroundAdoptTint?.value);
    add(`grass.${role.id}.groundAdoptStrength`, approx(strength, expected.grass.adoptStrength, 0.01)
      ? OK : FAIL, {
      category: 'uniform', expected: expected.grass.adoptStrength, resolved: +strength.toFixed(3),
      note: '§6.2 requires blades to take the colour of the ground under them.',
    });
    // A tint here is a multiply, not a hue. Anything below 1 scales the
    // adopted ground colour down and is almost never what an author means.
    const neutral = tint && tint.every((c) => approx(c, 1, 0.02));
    add(`grass.${role.id}.groundAdoptTint`, neutral ? OK : FAIL, {
      category: 'uniform', expected: [1, 1, 1], resolved: tint,
      note: neutral ? undefined
        : 'groundAdoptTint MULTIPLIES the sampled ground colour '
          + '(shaders-tsl/grass.js:273). A non-neutral value scales adoption down (D19-233).',
    });
  }

  // --- 4. Flags the library defaults ON that a scene can switch off --------
  //
  // Trunk shadow receiving is the worked example (branchTree.js:102 ships
  // `true`; this scene shipped `false` for two passes and bark had no
  // terminator anywhere). Counted across the whole tree group rather than
  // asserted per recipe, so a new recipe cannot reintroduce it quietly.
  let meshes = 0;
  let receiving = 0;
  world.trees?.group?.traverse?.((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    if (object.receiveShadow) receiving += 1;
  });
  const receiveRatio = meshes > 0 ? receiving / meshes : 0;
  add('trees.receiveShadow', receiveRatio >= expected.trees.minReceiveShadowRatio ? OK : FAIL, {
    category: 'flag',
    expected: `>= ${expected.trees.minReceiveShadowRatio} of tree meshes`,
    resolved: `${receiving}/${meshes} (${receiveRatio.toFixed(2)})`,
    note: 'Bark reads as a cylinder through its shadow terminator; without it a '
      + 'trunk is a flat stripe.',
  });

  // --- 5. Health: passes that can exist while producing nothing ------------
  //
  // `Boolean(runtime.shadowPass)` is true whenever the object exists and is
  // NOT a shadow check — `renderCount` is (D19-041).
  const shadowRenders = Number(world.runtime?.shadowPass?.renderCount ?? -1);
  add('shadowPass.renderCount', shadowRenders > 0 ? OK : FAIL, {
    category: 'health',
    expected: '> 0',
    resolved: shadowRenders,
    note: 'A shadow pass object that has rendered nothing leaves every receiver '
      + 'sampling cleared depth.',
  });

  // FILL-018. The single check that would have caught the pass-7 blocker.
  //
  // The imported-asset family (every lane building, every converted prop) is a
  // base `NodeMaterial` with `lights === false`, so three never builds a
  // lighting context for it and `setupLightingModel` — the whole ToonLab
  // surface-lighting model — is never called. Its indirect light arrives on ONE
  // channel, `ambientStrength` in its own node graph, and the preset ships that
  // at 0. At 0 every surface turned away from the sun renders arithmetically
  // black while its sunlit neighbour blows out, and the frame looks like an
  // exposure problem rather than a missing term.
  //
  // Enrolment counts cannot catch this: `installToonLabSurfaceLighting` writes
  // `userData.toonLabSurfaceLighting` unconditionally, so 215 lane materials
  // report as enrolled in a model that never runs. Read the number that
  // actually lights them instead, off a live material.
  const indirect = world.environmentIndirect ?? null;
  add('environment.ambientStrength', indirect && indirect.strength > 0 ? OK : FAIL, {
    category: 'uniform',
    expected: '> 0',
    resolved: indirect?.strength ?? '<absent>',
    note: 'At 0 every imported surface facing away from the sun is [0,0,0]. No '
      + 'exposure or grade lever can recover a value multiplied by zero.',
  });
  add('environment.indirectMaterials', (indirect?.materials ?? 0) > 0 ? OK : FAIL, {
    category: 'health',
    expected: '> 0',
    resolved: indirect?.materials ?? 0,
    note: 'The indirect term reached no environment-shader material, so the '
      + 'lane is unlit whatever the strength says.',
  });

  const groundField = world.runtime?.groundFieldPass ?? null;
  add('groundField.colorSemantics', groundField?.colorSemantics === 'visible-ground-color'
    ? OK : FAIL, {
    category: 'health',
    expected: 'visible-ground-color',
    resolved: groundField?.colorSemantics ?? '<no pass>',
    note: 'Grass adoption samples this pass; without it blades adopt nothing.',
  });
  add('groundField.ready', groundField?.ready === true ? OK : FAIL, {
    category: 'health', expected: true, resolved: groundField?.ready ?? false,
  });

  const surfaceAudit = world.surfaceAudit ?? null;
  if (surfaceAudit) {
    add('surface.audit', surfaceAudit.ok ? OK : FAIL, {
      category: 'health',
      expected: 'pass',
      resolved: surfaceAudit.ok ? 'pass' : surfaceAudit.issues.map((i) => i.code).join(','),
    });
  }

  // --- 6. Cloud and post: resolved back off the running systems ------------
  //
  // D19-260 / D19-261. Two defects of the SAME species as everything above, and
  // both were sitting in plain text:
  //
  //   * the cloud block's comments asked for a raised `density` and non-zero
  //     cloud-base shadowing while the values shipped 0.048 and 0 — a comment
  //     describing an intent the numbers never implemented, which is the ground
  //     profile all over again (D19-236);
  //   * the `call_me_sensei` POST preset ships `colorGrade: false`,
  //     `bloom: false` and `outlineStrength: 0`, so `contrast`, `saturation`,
  //     `warmth`, the depth cue and the screen-space outline are all accepted by
  //     the settings object and never evaluated. A scene can author them, print
  //     them, and render none of them.
  //
  // Both are checked the only honest way: read the value back off the resolved
  // params, and check the FEATURE FLAG as well as the parameter — a parameter
  // whose feature is off is a value that does not exist.
  const cloudParams = world.sky?.clouds?.toParams?.() ?? null;
  if (expected.cloud) {
    if (!cloudParams) {
      add('cloud.params', FAIL, {
        category: 'health',
        note: 'The sky system exposes no resolved cloud params; the audit cannot verify them.',
      });
    } else {
      for (const [group, key, want] of expected.cloud.values ?? []) {
        const resolved = cloudParams?.[group]?.[key];
        add(`cloud.${group}.${key}`, approx(resolved, want, 1e-4) ? OK : FAIL, {
          category: 'uniform', expected: want, resolved,
          note: 'Authored in the scene and read back off the resolved cloud params.',
        });
      }
      // The optical-depth cap. Past `density x thickness ~= 100` every ToonLab
      // surface-lighting material in the scene renders exact black — measured by
      // bisection, see the block in scene.js. A frame from a scene over that
      // line has no imported assets in it at all, which is precisely the class
      // of "plausible-looking wrong picture" this gate exists to stop.
      const depth = (cloudParams.shape?.density ?? 0) * (cloudParams.shape?.thickness ?? 0);
      add('cloud.opticalDepth', depth <= expected.cloud.maxOpticalDepth ? OK : FAIL, {
        category: 'health',
        expected: `<= ${expected.cloud.maxOpticalDepth}`,
        resolved: +depth.toFixed(1),
        note: 'Above this the sky probe collapses and every surface-lighting '
          + 'material renders black while the ground, grass, trees, water and rock '
          + 'beside them are unchanged (D19-260 / FILL-016).',
      });
    }
  }

  const postSettings = world.post?.getSettings?.() ?? world.post?.settings ?? null;
  if (expected.post) {
    if (!postSettings) {
      add('post.settings', FAIL, {
        category: 'health',
        note: 'The post pipeline exposes no resolved settings; the audit cannot verify it.',
      });
    } else {
      for (const feature of expected.post.features ?? []) {
        add(`post.features.${feature}`, postSettings.features?.[feature] === true ? OK : FAIL, {
          category: 'flag',
          expected: true,
          resolved: postSettings.features?.[feature] ?? false,
          note: 'The `call_me_sensei` post preset ships this OFF, which makes every '
            + 'parameter under it a dead key (D19-261).',
        });
      }
      for (const [key, want] of expected.post.parameters ?? []) {
        const resolved = postSettings.parameters?.[key];
        add(`post.${key}`, approx(resolved, want, 1e-4) ? OK : FAIL, {
          category: 'uniform', expected: want, resolved,
        });
      }
    }
  }

  // --- 7. Declared deviations ----------------------------------------------
  //
  // Anything switched off or pushed away from a library default on purpose.
  // These do not block; they are printed so the reason travels with the frame
  // instead of living in a comment nobody reads at review time.
  for (const deviation of expected.declared ?? []) {
    add(deviation.id, DECLARED, { category: 'declared', ...deviation });
  }

  const failures = checks.filter((c) => c.status === FAIL);
  const passed = checks.filter((c) => c.status === OK).length;
  const declared = checks.filter((c) => c.status === DECLARED).length;
  return {
    ok: failures.length === 0,
    checks,
    failures,
    summary: `${passed} pass · ${failures.length} fail · ${declared} declared`,
  };
}

/** One-line-per-check text form, for the capture log and the HUD. */
export function formatGardenConfigurationAudit(audit) {
  const lines = [`resolved-configuration audit: ${audit.summary}`];
  for (const check of audit.checks) {
    if (check.status === OK) continue;
    const mark = check.status === FAIL ? 'FAIL' : 'decl';
    const detail = check.status === FAIL
      ? `expected ${JSON.stringify(check.expected)}, resolved ${JSON.stringify(check.resolved)}`
      : (check.reason ?? '');
    lines.push(`  [${mark}] ${check.id}: ${detail}${check.note ? ` — ${check.note}` : ''}`);
  }
  return lines.join('\n');
}
