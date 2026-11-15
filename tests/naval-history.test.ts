import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game/engine.ts';
import {DEFAULT_FLEET,HISTORICAL_SHIPS,NAVIES,fleetSelection} from '../game/naval-history.ts';

test('the curated archive covers real wartime navies and safe local identities',()=>{
  assert.equal(HISTORICAL_SHIPS.length,72);
  assert.equal(NAVIES.length,23);
  assert.equal(new Set(HISTORICAL_SHIPS.map(ship=>ship.id)).size,72);
  for(const navy of NAVIES)assert.ok(HISTORICAL_SHIPS.some(ship=>ship.navy===navy.id),navy.name);
  for(const ship of HISTORICAL_SHIPS) {
    assert.match(ship.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(ship.year>=1937&&ship.year<=1945,ship.name);
    assert.equal(new URL(ship.source).protocol,'https:');
  }
});

test('stored fleet choices reject wrong roles and unknown paths without removing valid choices',()=>{
  assert.deepEqual(fleetSelection(null),DEFAULT_FLEET);
  const choices=fleetSelection({battleship:'richelieu',destroyer:'akagi',cruiser:'../../bad',transport:7});
  assert.equal(choices.battleship,'richelieu');assert.equal(choices.destroyer,DEFAULT_FLEET.destroyer);
  assert.equal(choices.cruiser,DEFAULT_FLEET.cruiser);assert.equal(choices.transport,DEFAULT_FLEET.transport);
});

test('port and starboard carrier islands move their damage target while retaining combat values',()=>{
  const game=new Game(()=>.5);game.wave=10;
  for(const [id,side] of [['akagi',-1],['hiryu',-1],['enterprise',1],['illustrious',1]] as const) {
    game.fleetAppearance['fleet-carrier']=id;
    const ship=game.spawnBoss();
    assert.equal(ship.hp,4400);assert.equal(ship.halfWidth,66);assert.equal(ship.halfLength,168);
    const bridge=ship.parts.find(part=>part.id==='bridge')!;
    assert.equal(Math.sign(bridge.x),side,id);assert.equal(bridge.maxHp,510);assert.equal(bridge.radius,23);
    assert.equal(ship.parts.find(part=>part.id==='flight-deck')!.maxHp,720);
  }
});

test('historical identity is captured per ship and survives destruction after a later fleet choice',()=>{
  const game=new Game(()=>.5);game.wave=5;game.fleetAppearance.battleship='rodney';
  const ship=game.spawnBoss();ship.x=240;ship.y=220;
  assert.equal(ship.appearance,'rodney');assert.equal(ship.hp,2800);
  game.fleetAppearance.battleship='bismarck';game.damageEnemy(ship,99999);
  assert.equal(game.wrecks[0].appearance,'rodney');
  assert.equal(game.spawnBoss().appearance,'bismarck');
});
