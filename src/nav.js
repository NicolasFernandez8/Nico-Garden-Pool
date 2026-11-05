export const ir = (page, id) => {
  window.location.hash = '/' + page + (id != null ? '/' + id : '');
};
