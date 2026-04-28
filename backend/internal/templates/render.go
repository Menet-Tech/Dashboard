package templates

import "strings"

func Render(content string, data map[string]string) string {
	result := content
	for key, value := range data {
		result = strings.ReplaceAll(result, "{"+key+"}", value)
	}
	return result
}
