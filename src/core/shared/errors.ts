export class BundleValidationError extends Error {
  override name = "BundleValidationError";
}

export class CodecChecksumError extends Error {
  override name = "CodecChecksumError";
}

export class UnsupportedBundleVersionError extends Error {
  override name = "UnsupportedBundleVersionError";
}

export class ConfigValidationError extends Error {
  override name = "ConfigValidationError";
}
