use coding_typescript_rust_fixture::longer;

#[test]
fn returns_the_longer_string() {
    assert_eq!(longer("gatto", "cammello"), "cammello");
}

#[test]
fn returns_the_first_on_a_tie() {
    assert_eq!(longer("abc", "xyz"), "abc");
}
