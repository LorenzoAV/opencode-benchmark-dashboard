/// Returns the longer of two string slices. On a tie, returns the first.
///
/// Incomplete: the body is not implemented yet, so the tests fail.
pub fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    todo!("complete the conversion from the TypeScript")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_the_longer_string() {
        assert_eq!(longer("gatto", "cammello"), "cammello");
    }

    #[test]
    fn returns_the_first_on_a_tie() {
        assert_eq!(longer("abc", "xyz"), "abc");
    }
}
