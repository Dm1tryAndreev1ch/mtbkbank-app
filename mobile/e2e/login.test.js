describe('Authentication Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should successfully bypass biometric and login via synthetic fallback', async () => {
    // Note: In detox iOS, FaceID mocks can bypass biometric natively.
    await expect(element(by.id('login-phone-input'))).toBeVisible();

    await element(by.id('login-phone-input')).typeText('+375291234567\n');
    await element(by.id('login-pin-input')).typeText('0000');
    
    await element(by.id('login-submit-button')).tap();

    // Verify Tab router navigation succeeded
    await expect(element(by.id('tab-bar-cards-button'))).toBeVisible();
  });
});
