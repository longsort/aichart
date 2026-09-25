/// ê²°ê³¼ ?˜í¼ (?ëŸ¬ ??UI?ì„œ ë©”ì‹œì§€ë§??œì‹œ)
sealed class Result<T> {
  const Result();
}

class Ok<T> extends Result<T> {
  final T value;
  const Ok(this.value);
}

class Err<T> extends Result<T> {
  final String message;
  const Err(this.message);
}
