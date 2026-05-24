import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('../src/config/commands.ts', import.meta.url), 'utf8');

describe('startup search commands cleanup', () => {
  it('keeps startup intelligence command allowlists in the startup command filter', () => {
    for (const id of [
      'layers:startup',
      'layers:aiInfra',
      'layer:datacenters',
      'layer:startupHubs',
      'layer:cloudRegions',
      'layer:accelerators',
      'layer:techHQs',
      'layer:techEvents',
      'panel:map',
    ]) {
      assert.match(source, new RegExp(`['"]${id}['"]`), `${id} should be explicitly available`);
    }

    assert.match(source, /SITE_VARIANT !== 'startup'/);
    assert.match(source, /STARTUP_LAYER_COMMANDS\.has\(cmd\.id\)/);
    assert.match(source, /STARTUP_PANEL_COMMANDS\.has\(cmd\.id\)/);
    assert.match(source, /STARTUP_VIEW_COMMANDS\.has\(cmd\.id\)/);
  });

  it('does not allow legacy World Monitor command groups in startup search', () => {
    const startupFilterStart = source.indexOf('const STARTUP_LAYER_COMMANDS');
    const startupFilterEnd = source.indexOf('export const COMMANDS');
    assert.ok(startupFilterStart >= 0 && startupFilterEnd > startupFilterStart);
    const startupFilterBlock = source.slice(startupFilterStart, startupFilterEnd);

    for (const id of [
      'layers:military',
      'layers:intel',
      'layer:ais',
      'layer:flights',
      'layer:conflicts',
      'layer:bases',
      'layer:radiation',
      'layer:sanctions',
      'panel:live-webcams',
      'panel:windy-webcams',
      'panel:strategic-risk',
      'panel:forecast',
      'panel:military-correlation',
      'panel:ucdp-events',
      'panel:climate',
      'panel:radiation-watch',
      'panel:airline-intel',
    ]) {
      assert.doesNotMatch(startupFilterBlock, new RegExp(`['"]${id}['"]`), `${id} must not be allowlisted for startup search`);
    }
  });
});
