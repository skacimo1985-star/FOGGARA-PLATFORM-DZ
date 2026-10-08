import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8');
const command=readFileSync(new URL('../src/pages/CommandCenter.tsx',import.meta.url),'utf8');
const agriculture=readFileSync(new URL('../src/features/agriculture/Agriculture.tsx',import.meta.url),'utf8');
const agricultureCss=readFileSync(new URL('../src/features/agriculture/agriculture.css',import.meta.url),'utf8');

test('primary platform navigation stays focused while advanced tools remain searchable',()=>{
  const primary=layout.slice(layout.indexOf('const groups'),layout.indexOf('const advancedItems'));
  for(const hidden of ['/app/nexus','/app/resources','/app/water','/app/automation','/app/analytics','/app/simulator','/app/iot','/app/metrology']){
    assert.equal(primary.includes(hidden),false,hidden);
    assert.ok(layout.includes(hidden),hidden);
  }
  assert.ok(layout.includes('destinations={allDestinations}'));
});

test('workspace keeps one persistent active project context and command center reads its real chain',()=>{
  assert.ok(layout.includes('foggara.activeProject'));
  assert.ok(layout.includes('os-context-bar'));
  assert.ok(command.includes('fg-project-mission'));
  for(const endpoint of ['measurements','evidences','recommendations','human-decisions','actions']){
    assert.ok(command.includes('/projects/${activeProjectId}/'+endpoint),endpoint);
  }
  for(const label of ['contextStage','dataStage','evidenceStage','intelligenceStage','decisionStage','actionStage']){
    assert.ok(command.includes(label),label);
  }
});

test('agriculture is embedded in the platform shell instead of showing a second application chrome',()=>{
  assert.ok(agriculture.includes('fg-workspace-tabs'));
  assert.ok(agricultureCss.includes('.os-main-content .fg-app>.fg-sidebar'));
  assert.ok(agricultureCss.includes('.os-main-content .fg-app>.fg-main>.fg-top'));
  assert.ok(agricultureCss.includes('display:none!important'));
});
