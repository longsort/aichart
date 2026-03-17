import 'package:flutter/foundation.dart';

import '../app_settings.dart';

/// Euro pass (EUR subscription/premium) — stub implementation.
/// No real EUR payment processor; uses AppSettings flags for access and expiry.
class EuroPassService {
  EuroPassService._();
  static final EuroPassService I = EuroPassService._();

  /// Whether the user has access to premium (Euro pass) features.
  /// Reads AppSettings.I.euroPassActive and expiry.
  bool get hasAccess {
    if (!AppSettings.I.euroPassActive.value) return false;
    final expiry = AppSettings.I.euroPassExpiryMs.value;
    if (expiry <= 0) return true;
    return DateTime.now().millisecondsSinceEpoch < expiry;
  }

  /// Expiry timestamp (ms). 0 or negative = no expiry (lifetime).
  int get expiryMs => AppSettings.I.euroPassExpiryMs.value;

  /// Stub purchase: sets active and optional expiry for testing.
  /// [productId] e.g. 'euro_pass_monthly', 'euro_pass_yearly'.
  /// No real EUR charge; for real payment, integrate later.
  Future<bool> purchaseProduct(String productId) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    int expiry = 0;
    if (productId.contains('monthly')) {
      expiry = now + 30 * 24 * 60 * 60 * 1000;
    } else if (productId.contains('yearly')) {
      expiry = now + 365 * 24 * 60 * 60 * 1000;
    }
    AppSettings.I.euroPassActive.value = true;
    AppSettings.I.euroPassExpiryMs.value = expiry;
    return true;
  }

  /// Revoke access (e.g. for testing).
  void revoke() {
    AppSettings.I.euroPassActive.value = false;
    AppSettings.I.euroPassExpiryMs.value = 0;
  }
}
