Component({
  properties: {
    studioName: { type: String, value: '椿屿影像' },
    avatar: { type: String, value: '' },
    showComment: { type: Boolean, value: false },
    showLike: { type: Boolean, value: false },
    liked: { type: Boolean, value: false },
    shareAsSheet: { type: Boolean, value: false }
  },
  data: {
    defaultAvatar: '/images/icons/avatar-default.png'
  },
  methods: {
    onHome() {
      this.triggerEvent('home')
    },
    onComment() {
      this.triggerEvent('comment')
    },
    onLike() {
      this.triggerEvent('like')
    },
    onShareTap() {
      this.triggerEvent('share')
    }
  }
})
