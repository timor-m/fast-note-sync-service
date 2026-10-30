export const sharePalettes = [
  { value: 'default', label: '标准', color: '#777777' },
  { value: 'green', label: '绿色', color: '#5d9369' },
  { value: 'blue', label: '蓝色', color: '#4c78c4' },
  { value: 'sky-blue', label: '天蓝', color: '#63b4d0' },
  { value: 'purple', label: '紫色', color: '#9470d5' },
  { value: 'orange', label: '橙色', color: '#da9253' },
  { value: 'rose', label: '玫瑰', color: '#d77990' },
  { value: 'teal', label: '青色', color: '#53aaa1' },
]
export function useSharePreferences() {
  return useState('share-reader-preferences', () => ({
    wide: true, contents: true, scheme: 'default', theme: 'system',
  }))
}
