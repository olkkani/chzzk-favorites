import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CHZZK 즐겨찾기',
    description: '치지직 사이드바 팔로잉 위에 나만의 즐겨찾기 목록을 추가합니다.',
    permissions: ['storage'],
  },
});
