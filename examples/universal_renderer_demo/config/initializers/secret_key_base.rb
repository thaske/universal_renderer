# Demo-only fallback so this example app works without encrypted credentials.
Rails.application.configure do
  config.secret_key_base =
    ENV.fetch(
      "SECRET_KEY_BASE",
      "universal-renderer-demo-secret-key-base-change-me"
    )
end
