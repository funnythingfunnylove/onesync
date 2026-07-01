# onesync Options + Popup Editorial Redesign

Status: Drafted for review

Date: 2026-07-01

Approval: Direction approved in-thread by the user on 2026-07-01; written spec pending review

## Goal

Redesign the `options` page and `popup` page so they feel like one coherent product surface:

- calmer
- more intentional
- more desktop-native
- less like an extension control panel
- less overloaded with explanatory text

The redesign should use the approved editorial minimalism direction, but remain practical for a bookmark-sync utility used repeatedly by a technical user.

## Scope

This redesign includes:

1. `entrypoints/options/main.ts`
2. `entrypoints/options/options.css`
3. `entrypoints/popup/main.ts`
4. `entrypoints/popup/popup.css`

The redesign does not change:

- sync logic
- bookmark storage logic
- private bookmark mutation behavior
- WebDAV behavior
- browser support semantics

## Product Read

`onesync` is not a marketing site, and it is not a generic SaaS dashboard.

It is a small utility that manages one shared bookmark dataset across browsers and a remote endpoint.

The interface should therefore feel like:

- a well-composed desktop utility
- a settings document with strong hierarchy
- a tool for repeated use by someone who already understands the product

It should not feel like:

- a landing page
- a colorful admin dashboard
- a card-heavy extension backend
- a tutorial page that keeps re-explaining itself

## User Intent Behind The Redesign

The user feedback is consistent:

- the current layout still feels too panel-heavy
- the bookmark manager needs better structure and more visual quality
- information density should increase
- explanatory copy is taking too much space
- the popup and options surfaces should feel related

The redesign should solve all of those at once through one shared visual system.

## Design Direction

### Chosen direction

Editorial settings workspace.

This means:

- warm monochrome base
- crisp structure lines
- limited spot color used only for state
- restrained typography with stronger hierarchy
- fewer decorative surfaces
- fewer equal-weight containers
- content organized like chapters, rails, and notes instead of boxes inside boxes

### Why this direction

This direction fits both requested skills:

- `minimalist-ui`: warm monochrome, crisp borders, editorial spacing, low-noise surfaces
- `ui-ux-pro-max`: stronger information hierarchy, more professional interaction structure, fewer confusing visual priorities

It also fits the product better than louder minimalism or bento-heavy layouts, because the tool is operational, not promotional.

## Approaches Considered

### Approach A: Editorial settings workspace

Use a narrow left rail and one dominant right-side reading column. Treat each major section as a chapter. Make the bookmark manager the main working chapter rather than one more floating panel.

Pros:

- best fit for the requested aesthetic
- strongest reduction in visual clutter
- preserves high utility while looking more considered
- lets `Bookmark manager` feel important without becoming noisy

Cons:

- requires rebalancing most of the current spacing and component hierarchy

Recommendation: yes

### Approach B: Asymmetric bento utility layout

Turn overview, sync, import/export, and activity into a more designed bento composition.

Pros:

- more dramatic
- more visually striking at a glance

Cons:

- too expressive for a tool page used repeatedly
- increases layout novelty without improving the core work of managing bookmarks

Recommendation: no

### Approach C: Native preference page

Make the entire page look like a conventional macOS settings sheet.

Pros:

- stable and familiar
- low risk

Cons:

- not distinctive enough
- does not fully use the requested editorial minimalism aesthetic

Recommendation: no

## Visual System

### Color

Base palette:

- canvas: `#FBFBFA`
- surface: `#FFFFFF`
- surface-muted: `#F7F6F3`
- border: `#EAEAEA`
- text: `#2F3437`
- muted text: `#787774`

State palette only:

- info: background `#E1F3FE`, text `#1F6C9F`
- success: background `#EDF3EC`, text `#346538`
- warning/error: background `#FDEBEC`, text `#9F2F2D`
- caution/attention: background `#FBF3DB`, text `#956400`

Rules:

- no gradients
- no saturated CTA bars
- no dark hero treatment
- no heavy shadows
- no color used as decoration only

### Typography

Primary UI font:

- `"SF Pro Display", "Geist Sans", "Helvetica Neue", "Switzer", sans-serif`

Optional editorial accent font for selected large headings only:

- `"Newsreader", "Lyon Text", "Instrument Serif", serif`

Monospace:

- `"Geist Mono", "SF Mono", "JetBrains Mono", monospace`

Hierarchy intent:

- page title: larger, quieter, more document-like
- section headings: chapter-like, not dashboard-like
- labels: compact uppercase utility labels
- metadata: monospace only where value stability matters, such as revision, bundle text, or URLs

### Surfaces

All major surfaces should use:

- `1px solid #EAEAEA`
- radius `8px` to `12px`
- flat fill
- almost no visible shadow

Nested card stacks should be reduced substantially. A section should read as a structured area first, not as a collection of boxes.

## Options Page Information Architecture

The page keeps a two-part macro structure:

1. narrow left rail
2. main content document

### Left rail

Purpose:

- orientation
- section navigation
- compact state summary
- device and version reference

Contents:

- product title
- compact sync state badge
- compact progress row when syncing
- section links
- version
- device id

The rail should feel like a document index, not a sidebar full of cards.

### Main column

The right side becomes one reading/work column with chapter sections:

1. Overview
2. Bookmark manager
3. Remote sync
4. Bundle
5. Activity

Each section should have:

- a compact heading row
- minimal support text
- one dominant content block

## Bookmark Manager Redesign

`Bookmark manager` becomes the visual and functional center of the page.

### Structural intent

The current three-pane concept remains, but it should stop looking like three equal dashboard cards.

New reading order:

1. chapter heading and meta
2. manager workspace
3. internal rails with clear primary and secondary emphasis

### Workspace structure

Within the bookmark manager chapter:

- left: `Directory`
- center: `List / Tree`
- right: `Details`

But the emphasis changes:

- `Directory` is a light index rail
- `List / Tree` is the main stage
- `Details` is a quieter annotation rail

The center column must visually dominate.

### Directory

The directory should feel like a document outline or Finder sidebar.

Requirements:

- light background distinction only
- tighter row height
- less button-like rendering
- selected state indicated through a narrow marker, weight, and subtle fill
- clearer nesting rhythm for subfolders

It should not feel like stacked CTA buttons.

### List / Tree

This is the core browsing surface.

Requirements:

- higher information density than the current version
- rows feel like list items, not cards
- folder and bookmark rows share one system
- URL/meta information sits quietly below or beside the title
- tab control is segmented and compact
- row spacing must support scanning
- disclosure affordances should be understated but legible

For the `Tree` view:

- indentation should be tighter
- expand/collapse controls should feel structural, not decorative

For the `Folders` view:

- current folder context should remain obvious without adding verbose copy

### Details rail

The details area should feel like a margin note or inspector, not another full-strength panel.

Requirements:

- compact selection summary
- URL or dataset note in quieter type
- grouped actions by intent:
  - Create
  - Organize
  - Remove

Buttons should be calmer and smaller than they are now. Destructive actions remain clearly separated.

### Bookmark manager copy policy

Normal state copy should be minimal.

Keep:

- labels
- counts
- selection state
- browser mode label
- empty states
- errors

Reduce or remove:

- repeated explanatory sentences about how onesync works
- long supporting blurbs under headings
- narrative descriptions inside normal management flow

## Overview Section Redesign

The overview section should become denser and cleaner.

Requirements:

- three compact summary cells remain acceptable
- each cell should show label, value, and one short meta line only
- no paragraph-length explanation
- revision, cadence, source, and state should feel like utility metadata

This section should read like a small status abstract, not like onboarding.

## Remote Sync Section Redesign

The remote settings chapter should look less like a loose form and more like a structured document block.

Requirements:

- left-aligned labels
- reduced visual noise
- consistent field sizing
- clearer grouping between credentials, base path, cadence, and toggles
- actions aligned as one grouped row with stronger primary/secondary hierarchy

The section heading copy should be shortened.

## Bundle Section Redesign

The import/export area should remain secondary.

Requirements:

- compact heading
- one action row
- one bundle text area
- minimal explanation

It should feel like a utility appendix, not a peer to the bookmark manager.

## Activity Section Redesign

The activity section should remain readable but lighter.

Requirements:

- tighter list item spacing
- quiet metadata
- stronger timestamp alignment
- lower visual weight than bookmark manager and remote sync

## Popup Redesign

The popup must use the same visual language, but in a much smaller footprint.

### Popup intent

The popup is not a mini settings page.

Its job is:

- show current state
- show minimal key facts
- allow sync
- open settings

### Popup structure

Recommended order:

1. product header
2. current state
3. progress if running
4. compact facts grid
5. error notice if needed
6. actions

### Popup visual treatment

Requirements:

- same warm monochrome palette as options
- same crisp border rules
- no extra explanation in the normal state
- stronger relation to the options page through typography and tone

The popup should feel like a clipped cover sheet from the same system.

### Popup copy policy

Keep:

- status
- last sync
- bookmark source
- version
- errors

Remove:

- descriptive product copy
- repetitive setup explanation in the normal state

### Popup actions

Action hierarchy:

- primary: `Sync`
- secondary: `Settings`

The primary action should be dark and compact, with the secondary action lighter and visually subordinate.

## Interaction Rules

1. Primary buttons use dark fill with white text.
2. Secondary buttons use white fill and structural border.
3. Status badges use only the approved pale semantic colors.
4. Hover and active states should be subtle.
5. Motion, if any, must be nearly invisible and not required for comprehension.
6. Focus states must remain visible.

## Accessibility Requirements

The redesign must preserve or improve:

- keyboard navigation
- visible focus states
- contrast on all labels and values
- clear disabled states
- touch target adequacy for popup actions and manager controls
- error visibility without relying on color alone

## Non-Goals

- no new routes
- no new feature logic
- no drag-and-drop
- no search
- no new data fields
- no modal workflow redesign
- no dark mode work in this pass

## Implementation Notes

This pass is intentionally visual and structural.

Implementation should favor:

- modifying existing markup where possible
- reorganizing layout wrappers where needed
- reducing copy rather than introducing new explanatory text
- keeping the current event wiring intact

## Acceptance Criteria

The redesign is successful when:

1. `options` and `popup` clearly feel like the same product.
2. The visual system is warmer, flatter, and more editorial than the current implementation.
3. The bookmark manager reads as the primary workspace.
4. Text volume is noticeably reduced across both surfaces.
5. Information density improves without making the UI feel cramped.
6. No sync or bookmark-management behavior changes.
7. The pages still build and behave correctly in Safari.
