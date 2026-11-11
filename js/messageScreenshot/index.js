window.AITPlatformFeatures.register('message-screenshot', () => {
    if (window.AITMessageActions?.supportsCurrentPlatform()) window.AITMessageActions.registerAction(new MessageScreenshotAction());
});
