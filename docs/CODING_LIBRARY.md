# Coding library content review

18 original Prepto problem statements, each with explicit input assumptions, deterministic outputs, two-language starters, illustrative examples, edge cases and reference guidance. Existing problem IDs remain stable. Categories and exact topic options are derived from the catalogue, so filters stay aligned with content.

| Problem | Difficulty | Category | Topics |
|---|---|---|---|
| Pair sum | easy | arrays | Arrays, Hash maps |
| Balanced brackets | medium | strings | Stacks, Strings |
| Merge intervals | hard | sorting | Sorting, Intervals |
| Delivery batches | easy | arrays | Arrays, Simulation |
| First seen IDs | easy | arrays | Arrays, Hash sets |
| Run labels | easy | strings | Strings, Counting |
| Last unique character | easy | strings | Strings, Hash maps |
| Window maxima sum | medium | arrays | Sliding window, Arrays |
| Missing attendance day | easy | search | Binary search, Sorted arrays |
| Peak room demand | medium | sorting | Sweep line, Intervals |
| Smallest budget prefix | medium | search | Binary search, Prefix sums |
| Folder depth | medium | stacks | Stacks, Paths |
| Next warmer reading | medium | stacks | Monotonic stack, Arrays |
| Largest garden patch | medium | graphs | Breadth-first search, Grids |
| Workshop ordering | hard | graphs | Topological sort, Graphs |
| Fewest stamps | medium | dynamic-programming | Dynamic programming, Unbounded choices |
| Nonadjacent shifts | medium | dynamic-programming | Dynamic programming, Arrays |
| Shortest tag cover | hard | strings | Sliding window, Hash maps |

Review checks: duplicate pair-sum indices keep the first prior occurrence; bracket input contains only bracket characters; merge intervals are inclusive, room bookings half-open; characters are ASCII where indexing matters; graph cycles and disconnected vertices are defined; coverage windows respect multiplicity and earliest ties. Numeric examples stay within JavaScript safe-integer arithmetic; this is an interview catalogue rather than a large-input benchmark.

`tests/codingLibrary.test.js` uses hand-written trusted oracles to check example and boundary scenarios for every problem without compiling starters or submitted code. It also checks input preservation, unique IDs, complete cursor traversal, combined filters and reference-answer hiding. Browser tests select a new graph/topic problem, inspect edge cases and switch to its Python starter.

Examples are not executable test results. AI review is separately labeled; the execution endpoint remains disabled. Content is maintained through reviewed Git changes, not a production seed or user-supplied executable validator.
