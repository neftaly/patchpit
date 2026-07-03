# Spatial Bindings

Game truth and spatial placement are separate.

The game doc should hold canonical game state. Spatial binding docs decide where
that state appears for a user, group, workspace, or physical anchor.

## Canonical Game Truth

The game app owns logical state:

```text
players
pieces
zones
decks
hands
turn/rules state
plugin/tool state
```

This is the state that rules care about.

## Binding State

Bindings are projections:

```text
game table appears at workspace pose X
piece A appears at table pose Y
panel B is docked left
tool C floats near selection
physical anchor D maps to table origin
```

Bindings can be personal, shared, or world-anchored.

## Binding Modes

- `unbound`: session exists as a tablet/surface app only.
- `virtual-table`: all users share a game/table coordinate system.
- `personal`: each user places the same session differently.
- `workspace`: placement is shared by a workspace doc.
- `physical`: placement is anchored to a room/object/device marker.
- `overlay`: helper panels/tools follow local user preference.

Disagreement is allowed unless the game rules explicitly require shared
placement.

## Rule

Consensus belongs to game rules. Placement belongs to bindings.

Do not corrupt the game doc to solve a display problem.
