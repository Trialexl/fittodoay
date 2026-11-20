from urllib.parse import urlsplit

from rest_framework.pagination import CursorPagination
from rest_framework.response import Response


class PrivateArchivePagination(CursorPagination):
    """Stable, complete account archives; relative links survive HTTPS proxies."""

    page_size = 50
    page_size_query_param = "limit"
    max_page_size = 100
    ordering = "-id"

    @staticmethod
    def relative(link):
        if link is None:
            return None
        parsed = urlsplit(link)
        return parsed.path + ("?" + parsed.query if parsed.query else "")

    def get_paginated_response(self, data):
        return Response(
            {
                "items": data,
                "next": self.relative(self.get_next_link()),
                "previous": self.relative(self.get_previous_link()),
            }
        )
