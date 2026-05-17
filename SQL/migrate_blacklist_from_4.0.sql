-- ============================================================
-- 從 4.0 Bot 匯入黑名單至 TFD guild_blacklist
-- 目標伺服器: 756195780242440337
-- 來源: data/link/twitter/black_list.json
--        data/link/ptt/black_list.json
--        data/link/youtube/black_list.json
-- 產生時間: 2026-05-16
-- ============================================================

-- 確保 guild_settings 中有此伺服器（guild_blacklist 有 FK 需要）
INSERT OR IGNORE INTO guild_settings (guild_id, guild_name, enabled, blacklist_enabled, joined_at, created_at, updated_at)
VALUES ('756195780242440337', NULL, 1, 1, strftime('%s','now'), strftime('%s','now'), strftime('%s','now'));

-- ────────────────────────────────────────────────────────────
-- Twitter 黑名單 (52 筆)
-- ────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO guild_blacklist (guild_id, platform, author, uid, level, label, added_by, reason, created_at, updated_at) VALUES
('756195780242440337', 'twitter', 'hikari_sd_', '1955205313268944896', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'GRAY_AIart', '1986766250740154368', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'tomoaisub2', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'ekoyamamimimi', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'holycch1', '1228325660', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'MaryAI1223', '1959204485663981568', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'Lykka_694', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'aiart_holo', '1949406910492684288', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'zlippers_AIer', '1937652217789710337', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'loveko28516', '1998012982543175680', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'FujiwaraHima', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'chikuwanorimaki', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'bubu2kUFO', '1972324199244136448', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'rukacchi0607', '1783498213020037000', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'andyleeyuan', '1917754624582598656', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'bobbiggs5000', '1228325660', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'fujiwara_ringox', '2027528226399260847', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'SekAI_AIart', '2027161207652925440', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'KGUY1920', '2015967301590290432', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'Emma_x_20240421', '1864331667143577605', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'Moi6D6F69', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'NineKey_AI', '1974901727221723136', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', '37bannAI', '1916050407606128643', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'zhongjoji00000', '1933831949631852875', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'mktdy38643534', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'alice_mia19', '2022308502514106400', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'SoyoriFuruta', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'gK24E08y6FDOi9f', NULL, 3, 'Anti', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'future_kun', NULL, 3, 'Anti', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'udoragidor72282', NULL, 3, 'Anti', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'emunculus', NULL, 3, 'Anti', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'testai321', '2022600317838491648', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'tsugu_gumi', '1892793738956771328', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'mameya_kn', '2006287601528131585', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'Vega_1119', '3301060750', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'X0aE2X5rfh96448', NULL, 3, 'Anti', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'NagisamaSub', NULL, 3, 'Anti', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'megamega_aiart', '1883688516934410200', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'extra5353', NULL, 3, '黑名單', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'rakukakikun', NULL, 3, '已提告', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'Sin_vlove4', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'sirokuro8223', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'monomidechu', NULL, 1, 'AI 假人咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'corocoro_irnp', NULL, 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'V_Virgin_Mary', NULL, 3, 'ANTI', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'SKCwcrlCOvgz1a9', NULL, 3, '黑料', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'komica5566', '2306539560', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'shimamuraa11451', '1836744572765888500', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'seri_musha', '1982394084041105400', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'nanowombat02', '1779247265246535700', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'h4k4s3_aae', '1946401991372271600', 1, 'AI 咒術師', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now')),
('756195780242440337', 'twitter', 'WholesomeKawaii', '1504077244418953200', 3, '盜圖人', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now'));

-- ────────────────────────────────────────────────────────────
-- PTT 黑名單 (1 筆)
-- ────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO guild_blacklist (guild_id, platform, author, uid, level, label, added_by, reason, created_at, updated_at) VALUES
('756195780242440337', 'ptt', 'l00011799z', NULL, 3, '黑V專門戶', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now'));

-- ────────────────────────────────────────────────────────────
-- YouTube 黑名單 (1 筆)
-- ────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO guild_blacklist (guild_id, platform, author, uid, level, label, added_by, reason, created_at, updated_at) VALUES
('756195780242440337', 'youtube', 'missusagiusagi', NULL, 3, '請親自到個人頻道查看原因', 'system_migration', '從 4.0 Bot 匯入', strftime('%s','now'), strftime('%s','now'));

-- ============================================================
-- 驗證：執行後檢查
-- ============================================================
-- SELECT platform, COUNT(*) AS cnt FROM guild_blacklist WHERE guild_id = '756195780242440337' GROUP BY platform;
-- 預期結果：twitter=52, ptt=1, youtube=1
