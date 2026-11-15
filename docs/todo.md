# 待办

Control Panel for Twitter 里在所有者的配置中生效、但是 xnote 决定暂时不做的设置项。
括号里是它们在那个扩展里的配置名。想要其中某一项时，单独拿出来做。

## 与 ADR-0001 冲突，不做

- 悬浮卡片里显示账号所在地（`addUserHoverCardAccountLocation`）：那个扩展为此自己调用 X 的内部接口 `AboutAccountQuery`。

## 有账号风险，不做

- 「关注」时间线按最新排序（`sortFollowing`）：做法是改写 X 发出的请求参数。
- 快速屏蔽，跳过确认对话框（`fastBlock`）：替用户自动点击「屏蔽」的确认按钮。

## 每项都是一小块独立功能，想念时再做

- 恢复帖子来源标签（`restoreTweetSource`）。
- 恢复外部链接下的标题（`restoreLinkHeadlines`）。
- 恢复帖子下的「引用」链接和其他互动链接（`restoreQuoteTweetsLink`、`restoreOtherInteractionLinks`）。
- 菜单里的「添加屏蔽词」（`addAddMutedWordMenuItem`）。
- 对特定帖子隐藏引用（`mutableQuoteTweets`）。

## 出现的页面少，逐页适配的成本高

- 隐藏关注者列表里的「认证」标签页（`hideVerifiedNotificationsTab`）。
- 隐藏订阅相关的入口（`hideSubscriptions`）。
- 隐藏「编辑图片」（`hideEditImage`）。
- 隐藏搜索页的推荐内容（`hideSuggestedContentSearch`）。
- 查看引用时隐藏被引用的帖子（`tweakQuoteTweetsPage`）。
- Premium 推销里必须用脚本标记的部分（`hideTwitterBlueUpsells` 的其余规则）。
- 「经典推特风格」的其余部分：其余页面上的「帖子」字样。

## 从未评估

那个扩展 4.25.1 有、xnote 没有、上面各节也没有记录的设置项。
它们在所有者的配置里是开还是关，没有确认过。想要其中某一项时，先在真实页面上确认它在当前的 X 上还有效。

### 时间线行为

- 默认打开「关注」时间线（`alwaysUseLatestTweets`）。
- 隐藏「为你推荐」时间线（`hideForYouTimeline`）。
- 停用主页时间线并重定向（`disableHomeTimeline`）。
- 转推放到单独的标签页（`retweets` 的「分开」模式）。xnote 只有「隐藏转推」。
- 引用推文的隐藏或分开（`quoteTweets`）。
- 列表里的转推处理（`listRetweets`）。
- 隐藏个人主页里的转推（`hideProfileRetweets`）。
- 隐藏 Grok 分享的推文（`hideGrokTweets`）。
- 隐藏「该作者的更多内容」（`hideMoreFromThisAuthor`）。
- 隐藏「查看新推文」提示（`hideSeeNewTweets`）。
- 隐藏 Premium 用户的回复（`hideTwitterBlueReplies`）。
- 搜索默认用「最新」（`defaultToLatestSearch`）。

### 导航栏和页面元素

- 隐藏导航项：呼叫、聊天、社群、历史、列表、Spaces（`hideCalls`、`hideChatNav`、`hideCommunitiesNav`、`hideHistoryNav`、`hideListsNav`、`hideSpacesNav`）。
- 隐藏发推按钮（`hideComposeTweet`）。
- 隐藏账号切换器（`hideAccountSwitcher`）。
- 隐藏主页发推框（`hideTimelineTweetBox`）。
- 隐藏「管理时间线」按钮（`hideManageTimelines`）。
- 隐藏回复排序菜单（`hideSortRepliesMenu`）。
- 导航栏密度（`navDensity`）。
- 侧栏分项：直播、推荐关注、今日新闻、有什么新鲜事、相关的人（`hideLiveBroadcasts`、`hideSuggestedFollows`、`hideTodaysNews`、`hideWhatsHappening`、`showRelevantPeople`）。xnote 现在是整个侧栏一起隐藏。

### 推文和按钮

- 隐藏书签按钮、隐藏分享按钮（`hideBookmarkButton`、`hideShareTweetButton`）。
- 隐藏全部互动计数（`hideMetrics`）。
- 减少互动模式，隐藏整排操作按钮（`reducedInteractionMode`）。
- 取消敏感内容模糊（`unblurSensitiveContent`）。
- 推文详情里显示账号所在地（`addFocusedTweetAccountLocation`）：和悬浮卡片那一项一样要自己请求接口，与 ADR-0001 冲突。
- 停用推文里的粗体和斜体（`disableTweetTextFormatting`）。

### 通知

- 隐藏通知角标（`hideNotifications`）。
- 隐藏点赞通知、隐藏转推通知（`hideNotificationLikes`、`hideNotificationRetweets`）。

### 外观

- 不使用 Chirp 字体（`dontUseChirpFont`）。
- 内容占满宽度（`fullWidthContent`）。
- 恢复旧版个人主页标签（`revertProfileTabs`）。
- 自定义 CSS（`customCss`）。
- 发推按钮和关注按钮跟随账号的主题色：xnote 的「经典推特风格」固定用经典蓝。

### 不需要做

- 只在手机版生效的 3 项（`hideLiveBroadcastBar`、`hideMessagesBottomNavItem`、`preventNextVideoAutoplay`）：xnote 只做桌面端。

## 在所有者的配置里本来就不生效，不需要做

- 回复的默认排序（`sortReplies`）：值是「相关」，这就是 X 的默认行为。
- Premium 回复的 4 个显示设置和粉丝数阈值（`showPremiumReply*`、`showBlueReplyFollowersCountAmount`）：上级开关 `hideTwitterBlueReplies` 是关的。
- 主页时间线重定向（`disabledHomeTimelineRedirect`）：上级开关 `disableHomeTimeline` 是关的。
- 7 个隐藏计数的设置项（`hide*Metrics`）：上级开关 `hideMetrics` 是关的。
- 媒体和卡片占满帖子宽度（`fullWidthMedia`）：只在 `fullWidthContent` 开启时起作用。
- 在帖子详情页显示书签按钮（`showBookmarkButtonUnderFocusedTweets`）：只在 `hideBookmarkButton` 开启时起作用。
- 深色模式主题（`darkModeTheme`）：那个扩展用它判断主题，不是一个可见的功能。
