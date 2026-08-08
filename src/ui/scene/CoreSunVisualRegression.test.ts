import assert from 'node:assert/strict';
import { CORE_SUN_GLOW_SCALE, CORE_SUN_LIGHT_DISTANCE, CORE_SUN_LIGHT_INTENSITY, CORE_SUN_RADIUS, SUN_ORBIT_RADIUS, SUN_RADIUS_MM } from '../config/KnowledgeUiConfig';

// The central visual Sun is intentionally twice the default ordinary-node radius (9).
assert.equal(CORE_SUN_RADIUS, 18);
assert.ok(CORE_SUN_RADIUS > SUN_ORBIT_RADIUS + SUN_RADIUS_MM, 'Sun must fully enclose the core triad');
assert.ok(CORE_SUN_GLOW_SCALE >= 6, 'corona must remain visible at whole-graph scale');
assert.ok(CORE_SUN_LIGHT_INTENSITY >= 20, 'central light must be visually meaningful');
assert.ok(CORE_SUN_LIGHT_DISTANCE >= 400, 'central light must attenuate across a meaningful portion of the graph');

console.log('Core sun visual regression tests passed');
