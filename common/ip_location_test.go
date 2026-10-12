package common

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFormatIPRegion(t *testing.T) {
	tests := []struct {
		name   string
		region string
		want   string
	}{
		{
			name:   "province and city",
			region: "中国|四川省|成都市|电信|CN",
			want:   "中国·四川省成都市",
		},
		{
			// 直辖市的实测原串为「中国|北京市|北京市|联通|CN」，省市同名故只输出省级
			name:   "municipality with identical province and city",
			region: "中国|北京市|北京市|联通|CN",
			want:   "中国·北京市",
		},
		{
			name:   "empty city falls back to province",
			region: "中国|广东省|0|电信|CN",
			want:   "中国·广东省",
		},
		{
			name:   "foreign country yields nothing",
			region: "United States|California|0|Google LLC|US",
			want:   "",
		},
		{
			name:   "empty province yields nothing",
			region: "中国|0|0|电信|CN",
			want:   "",
		},
		{
			name:   "too few fields yields nothing",
			region: "中国|四川省",
			want:   "",
		},
		{
			name:   "minimum field count still resolves",
			region: "中国|上海市|0",
			want:   "中国·上海市",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, formatIPRegion(tt.region))
		})
	}
}

// TestIP2RegionRawLayout 锁定内嵌 xdb 的字段顺序。数据若换回旧布局
// 「国家|区域|省|市|ISP」，formatIPRegion 读到的 parts[1]、parts[2] 会变成区域与省份，
// 从而静默产出错位的归属地（例如把省份当作城市），症状同样难以察觉。
// 判别关键在于末位：现布局为 ISO 代码，旧布局为 ISP 名称。
func TestIP2RegionRawLayout(t *testing.T) {
	require.NoError(t, initErr)
	searcher := getIPSearcher()
	require.NotNil(t, searcher)

	for _, ip := range []string{"114.247.88.29", "112.32.129.245", "218.192.0.1"} {
		region, err := searcher.Search(ip)
		require.NoError(t, err, "search %q", ip)

		parts := strings.Split(region, "|")
		require.Len(t, parts, 5, "unexpected field count for %q: %q", ip, region)
		assert.Equal(t, "中国", parts[0], "country for %q", ip)
		assert.Equal(t, "CN", parts[4], "ISO code for %q", ip)
		assert.NotEqual(t, "0", parts[1], "province placeholder for %q", ip)
		assert.NotEmpty(t, formatIPRegion(region), "location for %q", ip)
	}
}

// TestGetIPLocationResolvesEmbeddedData guards the embedded xdb: a corrupt or
// truncated data file makes every lookup return empty without any other failure.
func TestGetIPLocationResolvesEmbeddedData(t *testing.T) {
	for _, ip := range []string{"114.247.88.29", "112.32.129.245", "182.148.158.105"} {
		location := GetIPLocation(ip)
		assert.NotEmpty(t, location, "expected a location for public IP %q", ip)
		assert.Contains(t, location, "中国·", "unexpected format for %q", ip)
	}
}

func TestGetIPLocationSkipsNonPublicAddresses(t *testing.T) {
	for _, ip := range []string{
		"",
		"not-an-ip",
		"127.0.0.1",
		"::1",
		"10.0.0.1",
		"192.168.1.1",
		"172.16.0.1",
	} {
		assert.Empty(t, GetIPLocation(ip), "expected empty location for %q", ip)
	}
}
