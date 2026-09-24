# Convert the TypeScript to Rust

Outcome: `cargo test` exits 0 in the fixture.

The fixture holds one incomplete function, `longer`, and two failing tests. Complete `longer` so both tests pass.

## TypeScript to convert

```ts
function longer(a, b) {
    return a.length >= b.length ? a : b
}

console.log(longer("gatto", "cammello")) // => cammello
```

## Conditions

- `longer` takes two `&str` and returns the longer one as `&str`.
- On a tie it returns the first argument.
- Use lifetimes so the returned slice borrows from the inputs.
- Do not modify the tests.
- Do not add dependencies.

## Stop

Stop when `cargo test` exits 0.
